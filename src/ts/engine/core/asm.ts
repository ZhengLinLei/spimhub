/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/core/asm.ts

    Two pass assembler shared by every architecture. The instruction set
    (registers, pseudo instructions, encoding) is given by an `Arch`
    (src/ts/engine/mips/asm.ts, src/ts/engine/riscv/asm.ts).

        Pass 1 : parse every line, bind labels, compute the size of every
                 statement (pseudo instructions included).
        Pass 2 : evaluate expressions, expand pseudo instructions and encode
                 real machine words + data bytes.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

// ================== //
//  Memory map        //
// ================== //
// Same layout for MIPS (SPIM / MARS) and RISC-V (RARS)
export const SEGMENT = {
    text:  0x00400000,
    data:  0x10010000,
    ktext: 0x80000180,
    kdata: 0x90000000,
} as const;

export type SegmentName = keyof typeof SEGMENT;
export type ArchName = 'mips' | 'riscv';

export class AsmError extends Error {}

// ================== //
//  Program (output)  //
// ================== //
export interface Message { line: number; message: string; file?: string; }

export interface TextRow {
    addr: number;
    word: number;
    basic: string;      // Disassembled real instruction
    source: string;     // Source line (first word of a statement only)
    line: number;
    first: boolean;
    boot: boolean;      // Start up code
    segment: SegmentName;
}

export interface DataChunk { addr: number; bytes: Uint8Array; segment: SegmentName; line: number; }

export interface Program {
    ok: boolean;
    arch: ArchName;
    filename: string;
    errors: Message[];
    warnings: Message[];
    text: TextRow[];
    data: DataChunk[];
    symbols: Record<string, number>;
    consts: Record<string, number>;
    entry: number;
    startup: boolean;
    textStart: number; textEnd: number;
    dataStart: number; dataEnd: number;
    ktextEnd: number; kdataEnd: number;
    hasKernelHandler: boolean;
    dataBytes: number;
}

export interface AssembleOptions { filename?: string; startup?: boolean | 'auto'; }

// ================== //
//  Helpers           //
// ================== //
export const fitsS16 = (v: number) => v >= -32768 && v <= 32767;
export const fitsU16 = (v: number) => v >= 0 && v <= 0xffff;
export const hi16 = (v: number) => (v >>> 16) & 0xffff;
export const lo16 = (v: number) => v & 0xffff;
// %hi() with carry adjustment, so that  lui + signed offset  rebuilds v
export const hiAdj = (v: number) => (((v >>> 0) + 0x8000) >>> 16) & 0xffff;
export const loS = (v: number) => (v << 16) >> 16;

const ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, '"': 34, "'": 39, a: 7, b: 8, f: 12, v: 11 };

const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/**
 * @desc: Decodes a quoted string literal (with escapes) into byte codes
*/
export const parseStringLiteral = (lit: string): number[] => {
    const out: number[] = [];
    const body = lit.slice(1, -1);
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '\\' && i + 1 < body.length) {
            const n = body[++i];
            if (n === 'x') {
                const h = body.slice(i + 1, i + 3).match(/^[0-9a-fA-F]+/);
                if (h) { out.push(parseInt(h[0], 16)); i += h[0].length; continue; }
            }
            out.push(n in ESCAPES ? ESCAPES[n] : n.charCodeAt(0));
            continue;
        }
        const code = c.codePointAt(0)!;
        if (code > 0x7f) {
            // UTF-8 encode non ascii characters
            out.push(...utf8(String.fromCodePoint(code)));
            if (code > 0xffff) i++;
        } else out.push(code);
    }
    return out;
};

// ================== //
//  Lexer             //
// ================== //
/**
 * @desc: Removes a comment (# or //) that is not inside a string / char literal
*/
const stripComment = (line: string): string => {
    let q: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '\\') { i++; continue; }
            if (c === q) q = null;
            continue;
        }
        if (c === '"' || c === "'") { q = c; continue; }
        if (c === '#' || (c === '/' && line[i + 1] === '/')) return line.slice(0, i);
    }
    return line;
};

/**
 * @desc: Splits operands by commas, respecting quotes and parentheses
*/
export const splitOperands = (s: string): string[] => {
    const out: string[] = [];
    let cur = '', q: string | null = null, depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) {
            cur += c;
            if (c === '\\') { cur += s[++i] || ''; continue; }
            if (c === q) q = null;
            continue;
        }
        if (c === '"' || c === "'") { q = c; cur += c; continue; }
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += c;
    }
    if (cur.trim() !== '' || out.length) out.push(cur.trim());
    return out;
};

// ================== //
//  Expressions       //
// ================== //
export type Expr =
    | { k: 'num'; v: number }
    | { k: 'sym'; v: string }
    | { k: 'un'; op: string; e: Expr }
    | { k: 'bin'; op: string; l: Expr; r: Expr }
    | { k: 'fn'; name: 'hi' | 'lo'; e: Expr };

type Token = { k: 'num'; v: number } | { k: 'sym'; v: string } | { k: 'op'; v: string } | { k: 'fn'; v: 'hi' | 'lo' };

const TOKEN_RE = /\s*(?:(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+\.\d*(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+|\.\d+(?:[eE][-+]?\d+)?|\d+)|('(?:\\.|[^'\\])')|([A-Za-z_.$][\w.$]*)|%(hi|lo)\b|(<<|>>|[-+*/%&|^~()]))/y;

/**
 * @desc: Parses an expression into a small AST
 *        Grammar (lowest to highest): | ^ & << >> + - * / % unary
*/
export const parseExpr = (src: string): Expr => {
    const toks: Token[] = [];
    let pos = 0;
    while (pos < src.length) {
        TOKEN_RE.lastIndex = pos;
        const m = TOKEN_RE.exec(src);
        if (!m) {
            if (src.slice(pos).trim() === '') break;
            throw new AsmError(`invalid expression "${src}"`);
        }
        pos = TOKEN_RE.lastIndex;
        if (m[1] !== undefined) {
            const t = m[1];
            let v: number;
            if (/^0[xX]/.test(t)) v = parseInt(t.slice(2), 16);
            else if (/^0[bB]/.test(t)) v = parseInt(t.slice(2), 2);
            else v = Number(t);
            toks.push({ k: 'num', v });
        } else if (m[2] !== undefined) {
            toks.push({ k: 'num', v: parseStringLiteral(m[2])[0] || 0 });
        } else if (m[3] !== undefined) {
            toks.push({ k: 'sym', v: m[3] });
        } else if (m[4] !== undefined) {
            toks.push({ k: 'fn', v: m[4] as 'hi' | 'lo' });
        } else {
            toks.push({ k: 'op', v: m[5] });
        }
    }
    if (!toks.length) throw new AsmError('missing expression');

    let i = 0;
    const peek = () => toks[i];
    const isOp = (v: string) => peek() && peek().k === 'op' && peek().v === v;

    const binary = (next: () => Expr, ops: string[]) => (): Expr => {
        let left = next();
        while (peek() && peek().k === 'op' && ops.includes(peek().v as string)) {
            const op = toks[i++].v as string;
            left = { k: 'bin', op, l: left, r: next() };
        }
        return left;
    };
    const unary = (): Expr => {
        if (isOp('-') || isOp('+') || isOp('~')) {
            const op = toks[i++].v as string;
            return { k: 'un', op, e: unary() };
        }
        // %hi(expr) / %lo(expr) relocations
        if (peek() && peek().k === 'fn') {
            const name = toks[i++].v as 'hi' | 'lo';
            if (!isOp('(')) throw new AsmError(`"%${name}" expects (expression)`);
            i++;
            const e = or();
            if (!isOp(')')) throw new AsmError(`missing ")" in "${src}"`);
            i++;
            return { k: 'fn', name, e };
        }
        if (isOp('(')) {
            i++;
            const e = or();
            if (!isOp(')')) throw new AsmError(`missing ")" in "${src}"`);
            i++;
            return e;
        }
        const t = toks[i++];
        if (!t || t.k === 'op' || t.k === 'fn') throw new AsmError(`invalid expression "${src}"`);
        return t;
    };
    const mul = binary(unary, ['*', '/', '%']);
    const add = binary(mul, ['+', '-']);
    const shift = binary(add, ['<<', '>>']);
    const and = binary(shift, ['&']);
    const xor = binary(and, ['^']);
    const or: () => Expr = binary(xor, ['|']);

    const ast = or();
    if (i < toks.length) throw new AsmError(`unexpected "${toks[i].v}" in "${src}"`);
    return ast;
};

const exprSymbols = (e: Expr | null, out: string[] = []): string[] => {
    if (!e) return out;
    if (e.k === 'sym') out.push(e.v);
    if (e.k === 'bin') { exprSymbols(e.l, out); exprSymbols(e.r, out); }
    if (e.k === 'un' || e.k === 'fn') exprSymbols(e.e, out);
    return out;
};

// ================== //
//  Operands          //
// ================== //
/*
    Parsed operands carry an expression (`expr`); resolved operands carry a
    value (`v`). The pseudo expanders work with both.
*/
export type RegOp = { t: 'reg'; n: number; src?: string; expr?: undefined };
export type FregOp = { t: 'freg'; n: number; src?: string; expr?: undefined };
export type ImmOp = { t: 'imm'; v?: number; expr?: Expr; src?: string };
export type MemOp = { t: 'mem'; v?: number; expr?: Expr | null; base: number; src?: string };
export type Operand = RegOp | FregOp | ImmOp | MemOp;
export type Valued = ImmOp | MemOp;

/**
 * @desc: Parses one operand into { t: reg | freg | imm | mem }
*/
// ================== //
//  Architecture      //
// ================== //
/*
    Everything the assembler needs to know about an instruction set.
    expand(mn, ops, ctx) returns the real instructions of a statement:
        [ [name, [operand, ...], extraBits?], ... ]
*/
export interface Arch {
    name: ArchName;
    label: string;                                          // MIPS32 / RV32IM
    // Register name -> operand, null if `s` is not a register (throws for invalid ones)
    parseRegister(s: string): RegOp | FregOp | null;
    expand(mn: string, ops: Operand[], ctx: Ctx): Real[];
    encode(mn: string, ops: Operand[], pc: number, extra?: number): number;
    disassemble(word: number, pc: number): string;
    // %hi() / %lo() relocations
    hi(v: number): number;
    lo(v: number): number;
    // Start up code added when the program defines `main`
    startup: string[];
}

/**
 * @desc: Parses one operand into { t: reg | freg | imm | mem }
*/
const parseOperand = (s: string, arch: Arch): Operand => {
    s = s.trim();
    if (s === '') throw new AsmError('missing operand');
    const reg = arch.parseRegister(s);
    if (reg) return reg;

    // offset(base) | (base)
    const mem = /^(.*?)\(\s*([^()]+?)\s*\)$/.exec(s);
    if (mem) {
        const base = arch.parseRegister(mem[2]);
        if (base) {
            if (base.t !== 'reg') throw new AsmError(`invalid base register "${mem[2]}"`);
            return { t: 'mem', expr: mem[1].trim() ? parseExpr(mem[1]) : null, base: base.n, src: s };
        }
    }
    if (s.startsWith('$')) throw new AsmError(`invalid register "${s}"`);
    return { t: 'imm', expr: parseExpr(s), src: s };
};

// ================== //
//  Pseudo / forms    //
// ================== //
export type Real = [string, Operand[], number?];

export interface Ctx {
    val(op: Operand, allowFloat?: boolean): number;
    isLong(op: Operand, compute: () => boolean): boolean;
}

export const R = (n: number): RegOp => ({ t: 'reg', n });
export const F = (n: number): FregOp => ({ t: 'freg', n });
export const I = (v: number): ImmOp => ({ t: 'imm', v });
export const M = (v: number, base: number): MemOp => ({ t: 'mem', v, base });

export const isReg = (o?: Operand): o is RegOp => !!o && o.t === 'reg';
export const isFreg = (o?: Operand): o is FregOp => !!o && o.t === 'freg';
export const isImm = (o?: Operand): o is ImmOp => !!o && o.t === 'imm';
export const isMem = (o?: Operand): o is MemOp => !!o && o.t === 'mem';

export function want(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new AsmError(msg);
}

export const resolve = (op: Operand, ctx: Ctx): Operand => {
    if (op.expr === undefined) return op;   // Already resolved
    if (isImm(op)) return I(ctx.val(op));
    if (isMem(op)) return M(op.expr ? ctx.val(op) : 0, op.base);
    return op;
};

// ================== //
//  Assembler         //
// ================== //
const DIRECTIVES = new Set([
    '.data', '.text', '.kdata', '.ktext', '.rdata', '.sdata',
    '.word', '.half', '.hword', '.short', '.2byte', '.4byte', '.byte', '.float', '.double',
    '.ascii', '.asciiz', '.asciz', '.string', '.space', '.skip', '.zero', '.align', '.balign', '.p2align',
    '.globl', '.global', '.extern', '.ent', '.end', '.set', '.eqv', '.equ', '.file', '.section',
    '.option', '.type', '.size', '.attribute',
]);
const DATA_SIZE: Record<string, number> = { '.word': 4, '.4byte': 4, '.half': 2, '.hword': 2, '.short': 2, '.2byte': 2, '.byte': 1, '.float': 4, '.double': 8 };

type Evaluator = (e: Expr, allowFloat?: boolean) => number;

interface Statement {
    line: number;
    raw: string;
    labels: string[];
    mn: string | null;
    ops: string[];
    rest: string;
    boot?: boolean;
    // Pass 1
    parsed?: Operand[];
    segment?: SegmentName;
    addr?: number;
    size?: number;
    decisions?: boolean[];
    cursor?: number;
    failed?: boolean;
    emit?: (ev: Evaluator) => ArrayLike<number>;
}

interface DirectiveState {
    seg: Record<SegmentName, number>;
    cur: SegmentName;
    align(n: number): void;
    bindPending(addr: number): void;
    consts: Record<string, number>;
    evalExpr(e: Expr, strict: boolean, allowFloat?: boolean): number;
    isText(): boolean;
    warnings: Message[];
}

export class Assembler {

    static SEGMENT = SEGMENT;
    static AsmError = AsmError;
    static parseExpr = parseExpr;

    constructor(public arch: Arch) {}

    /**
     * @desc: Assembles the source code with the architecture of this assembler
     * @param: source {:string} - The assembly code
     * @param: options {:object} - { filename, startup: auto|true|false }
     * @return: {:Program}
    */
    assemble(source: string, options: AssembleOptions = {}): Program {
        const filename = options.filename || 'file.asm';
        const errors: Message[] = [], warnings: Message[] = [];
        const lines = String(source).replace(/\r\n?/g, '\n').split('\n');

        const fail = (e: unknown, line: number) => {
            if (!(e instanceof AsmError)) throw e;
            errors.push({ line, message: e.message });
        };

        // ---------------- Parse ----------------
        const stmts: Statement[] = [];
        lines.forEach((raw, idx) => {
            const line = idx + 1;
            try {
                let s = stripComment(raw).trim();
                const labels: string[] = [];
                let m: RegExpExecArray | null;
                while ((m = /^([A-Za-z_.][\w.$]*)\s*:/.exec(s))) {
                    labels.push(m[1]);
                    s = s.slice(m[0].length).trim();
                }
                let mn: string | null = null, ops: string[] = [], rest = '';
                if (s) {
                    m = /^([.A-Za-z_][\w.]*)\s*(.*)$/.exec(s);
                    if (!m) throw new AsmError(`syntax error near "${s}"`);
                    mn = m[1].toLowerCase();
                    rest = m[2].trim();
                    ops = rest ? splitOperands(rest) : [];
                }
                if (labels.length || mn) stmts.push({ line, raw: raw.trim(), labels, mn, ops, rest });
            } catch (e) { fail(e, line); }
        });

        const hasMain = stmts.some(s => s.labels.includes('main'));
        const startup = options.startup === undefined || options.startup === 'auto' ? hasMain : !!options.startup;
        if (startup) {
            const boot: Statement[] = this.arch.startup.map((src) => {
                const m = /^(\S+)\s*(.*)$/.exec(src)!;
                return { line: 0, raw: src, labels: [], mn: m[1], ops: splitOperands(m[2]), rest: m[2], boot: true };
            });
            boot[0].labels.push('__start');
            stmts.unshift({ line: 0, raw: '.text', labels: [], mn: '.text', ops: [], rest: '', boot: true }, ...boot);
        }

        // ---------------- Pass 1 ----------------
        const symbols: Record<string, number> = Object.create(null);    // label -> address
        const consts: Record<string, number> = Object.create(null);     // .eqv name -> value
        const seg: Record<SegmentName, number> = { text: SEGMENT.text, data: SEGMENT.data, ktext: SEGMENT.ktext, kdata: SEGMENT.kdata };
        let cur: SegmentName = 'text';
        let pending: { name: string; line: number }[] = [];  // labels waiting for the next aligned data item

        const isText = () => cur === 'text' || cur === 'ktext';
        const define = (name: string, addr: number, line: number) => {
            if (name in symbols || name in consts) errors.push({ line, message: `label "${name}" is defined twice` });
            else symbols[name] = addr >>> 0;
        };
        const bindPending = (addr: number) => {
            pending.forEach(({ name, line }) => define(name, addr, line));
            pending = [];
        };
        const align = (n: number) => { seg[cur] = (seg[cur] + n - 1) & ~(n - 1); };

        // Expression evaluation
        const evalExpr = (e: Expr, strict: boolean, allowFloat = false): number => {
            switch (e.k) {
                case 'num': return e.v;
                case 'sym': {
                    if (e.v in consts) return consts[e.v];
                    if (e.v in symbols) return symbols[e.v];
                    if (strict) throw new AsmError(`undefined symbol "${e.v}"`);
                    return 0;
                }
                case 'un': {
                    const v = evalExpr(e.e, strict, allowFloat);
                    return e.op === '-' ? -v : e.op === '~' ? ~v : v;
                }
                case 'fn': {
                    const v = evalExpr(e.e, strict, false);
                    return e.name === 'hi' ? this.arch.hi(v) : this.arch.lo(v);
                }
                case 'bin': {
                    const a = evalExpr(e.l, strict, allowFloat), b = evalExpr(e.r, strict, allowFloat);
                    switch (e.op) {
                        case '+': return a + b;
                        case '-': return a - b;
                        case '*': return allowFloat ? a * b : Math.imul(a, b);
                        case '/': if (b === 0) throw new AsmError('division by zero in expression'); return allowFloat ? a / b : Math.trunc(a / b);
                        case '%': if (b === 0) throw new AsmError('division by zero in expression'); return a % b;
                        case '<<': return a << b;
                        case '>>': return a >> b;
                        case '&': return a & b;
                        case '|': return a | b;
                        case '^': return a ^ b;
                    }
                }
            }
            throw new AsmError('invalid expression');
        };
        const isConstExpr = (e: Expr) => exprSymbols(e).every(s => s in consts);

        const makeCtx = (pass: 1 | 2, stmt: Statement): Ctx => ({
            val: (op, allowFloat = false) => {
                const o = op as Valued;
                if (o.expr === undefined) return o.v as number;
                if (o.expr === null) return 0;
                const v = evalExpr(o.expr, pass === 2, allowFloat);
                if (!allowFloat && !Number.isInteger(v)) throw new AsmError(`"${o.src}" is not an integer`);
                if (!allowFloat && (v > 0xffffffff || v < -0x80000000)) throw new AsmError(`value ${o.src} does not fit in 32 bits`);
                return allowFloat ? v : v | 0;
            },
            // Pass 1 decides between short and long encodings, pass 2 replays the decision
            isLong: (op, compute) => {
                const decisions = stmt.decisions!;
                if (pass === 1) {
                    const expr = (op as Valued).expr;
                    const known = expr === undefined || expr === null || isConstExpr(expr);
                    const long = known ? compute() : true;
                    decisions.push(long);
                    return long;
                }
                const d = decisions[stmt.cursor!++];
                return d === undefined ? compute() : d;
            },
        });

        const parseOps = (stmt: Statement): Operand[] => {
            if (!stmt.parsed) stmt.parsed = stmt.ops.map(op => parseOperand(op, this.arch));
            return stmt.parsed;
        };

        const dirState: DirectiveState = {
            seg,
            get cur() { return cur; },
            set cur(v: SegmentName) { cur = v; },
            align, bindPending, consts, evalExpr, isText, warnings,
        };

        stmts.forEach((st) => {
            try {
                st.labels.forEach((name) => {
                    if (isText()) define(name, seg[cur], st.line);
                    else pending.push({ name, line: st.line });
                });
                if (!st.mn) return;

                if (st.mn.startsWith('.')) {
                    this.directive(st, dirState);
                    return;
                }

                // Instruction
                if (!isText()) {
                    warnings.push({ line: st.line, message: 'instruction in data segment, switching to .text' });
                    cur = 'text';
                }
                if (seg[cur] & 3) align(4);
                st.segment = cur;
                st.addr = seg[cur];
                st.decisions = [];
                st.size = this.arch.expand(st.mn, parseOps(st), makeCtx(1, st)).length;
                seg[cur] += 4 * st.size;
            } catch (e) {
                fail(e, st.line);
                st.failed = true;
            }
        });
        bindPending(seg[cur]);

        if (startup && !('main' in symbols)) errors.push({ line: 0, message: 'the following symbols are undefined: main' });

        // ---------------- Pass 2 ----------------
        const text: TextRow[] = [];
        const dataChunks: DataChunk[] = [];

        stmts.forEach((st) => {
            if (st.failed || !st.mn) return;
            try {
                if (st.mn.startsWith('.')) {
                    if (st.emit) {
                        const bytes = st.emit((e, allowFloat) => evalExpr(e, true, allowFloat));
                        if (bytes.length) dataChunks.push({ addr: st.addr!, bytes: Uint8Array.from(bytes), segment: st.segment!, line: st.line });
                    }
                    return;
                }
                st.cursor = 0;
                const ctx = makeCtx(2, st);
                const out = this.arch.expand(st.mn, parseOps(st), ctx);
                if (out.length !== st.size) throw new AsmError('internal error: pseudo instruction size changed');
                out.forEach(([mn, ops, extra], k) => {
                    const pc = st.addr! + 4 * k;
                    const word = this.arch.encode(mn, ops.map(op => resolve(op, ctx)), pc, extra);
                    text.push({
                        addr: pc, word,
                        basic: this.arch.disassemble(word, pc),
                        source: k === 0 ? st.raw : '',
                        line: st.line,
                        first: k === 0,
                        boot: !!st.boot,
                        segment: st.segment!,
                    });
                });
            } catch (e) { fail(e, st.line); }
        });

        errors.sort((a, b) => a.line - b.line);

        const userText = text.filter(t => t.segment === 'text');
        const data = dataChunks.filter(c => c.segment === 'data');
        const textStart = SEGMENT.text;
        const textEnd = userText.length ? Math.max(...userText.map(t => t.addr)) + 4 : textStart;
        const dataEnd = Math.max(seg.data, SEGMENT.data);

        let entry: number = textStart;
        if (!startup) {
            if ('__start' in symbols) entry = symbols.__start;
            else if ('main' in symbols) entry = symbols.main;
            else if (userText.length) entry = userText[0].addr;
        }

        return {
            ok: errors.length === 0,
            arch: this.arch.name,
            filename,
            errors: errors.map(e => ({ ...e, file: filename })),
            warnings: warnings.map(w => ({ ...w, file: filename })),
            text,
            data: dataChunks,
            symbols: { ...symbols },
            consts: { ...consts },
            entry,
            startup,
            textStart, textEnd,
            dataStart: SEGMENT.data, dataEnd,
            ktextEnd: seg.ktext, kdataEnd: seg.kdata,
            hasKernelHandler: text.some(t => t.addr === SEGMENT.ktext),
            dataBytes: data.reduce((n, c) => n + c.bytes.length, 0),
        };
    }

    /**
     * @desc: Pass 1 handler for directives: moves the location counter and
     *        prepares an emitter used in pass 2
    */
    private directive(st: Statement, s: DirectiveState): void {
        const d = st.mn!;
        const ops = st.ops;
        if (!DIRECTIVES.has(d)) throw new AsmError(`unknown directive "${d}"`);

        switch (d) {
            case '.text': case '.data': case '.ktext': case '.kdata': case '.rdata': case '.sdata': {
                s.bindPending(s.seg[s.cur]);
                s.cur = (d === '.rdata' || d === '.sdata') ? 'data' : d.slice(1) as SegmentName;
                if (ops.length) s.seg[s.cur] = s.evalExpr(parseExpr(ops[0]), true) >>> 0;
                return;
            }
            case '.section': {
                const name = (ops[0] || '').replace(/^\./, '');
                if (['text', 'data', 'rdata', 'bss', 'sdata'].includes(name)) {
                    s.bindPending(s.seg[s.cur]);
                    s.cur = name === 'text' ? 'text' : 'data';
                }
                return;
            }
            case '.globl': case '.global': case '.extern': case '.ent': case '.end': case '.file':
                return;
            case '.eqv': case '.equ': case '.set': {
                if (d === '.set' && ops.length < 2) return;   // .set noreorder, .set noat ...
                // ".eqv NAME value" or ".eqv NAME, value"
                let name: string, value: string;
                if (ops.length >= 2) { name = ops[0]; value = ops.slice(1).join(','); }
                else {
                    const m = /^([A-Za-z_.][\w.]*)\s+(.+)$/.exec(st.rest);
                    if (!m) throw new AsmError(`"${d}" expects a name and a value`);
                    name = m[1]; value = m[2];
                }
                if (!/^[A-Za-z_.][\w.]*$/.test(name)) throw new AsmError(`invalid name "${name}"`);
                s.consts[name] = s.evalExpr(parseExpr(value), true);
                return;
            }
            case '.option': case '.type': case '.size': case '.attribute':
                return;
            case '.align': case '.balign': case '.p2align': {
                if (!ops.length) throw new AsmError(`"${d}" expects a number`);
                const n = s.evalExpr(parseExpr(ops[0]), true);
                const bytes = d === '.balign' ? n : 1 << n;
                if (n < 0 || bytes > 1 << 16) throw new AsmError(`invalid alignment ${n}`);
                if (bytes > 1) s.align(bytes);
                return;
            }
        }

        // ---- Data emitting directives ----
        st.segment = s.cur;
        if (d in DATA_SIZE) {
            const size = DATA_SIZE[d];
            if (!ops.length) throw new AsmError(`"${d}" expects at least one value`);
            if (s.isText()) s.warnings.push({ line: st.line, message: `"${d}" inside the text segment` });
            s.align(size);
            s.bindPending(s.seg[s.cur]);
            st.addr = s.seg[s.cur];

            // value or value:count
            const items = ops.map(op => {
                const m = /^(.*?):\s*(.+)$/.exec(op);
                if (m && !/^['"]/.test(op)) {
                    const count = s.evalExpr(parseExpr(m[2]), true);
                    if (count < 0 || count > 1 << 20) throw new AsmError(`invalid repeat count ${count}`);
                    return { expr: parseExpr(m[1]), count, src: op };
                }
                return { expr: parseExpr(op), count: 1, src: op };
            });
            const total = items.reduce((n, it) => n + it.count, 0);
            s.seg[s.cur] += total * size;

            const isFloat = d === '.float' || d === '.double';
            st.emit = (ev) => {
                const buf = new DataView(new ArrayBuffer(total * size));
                let off = 0;
                items.forEach(it => {
                    const v = ev(it.expr, isFloat);
                    if (!isFloat && !Number.isInteger(v)) throw new AsmError(`"${it.src}" is not an integer`);
                    for (let k = 0; k < it.count; k++, off += size) {
                        if (d === '.float') buf.setFloat32(off, v, true);
                        else if (d === '.double') buf.setFloat64(off, v, true);
                        else if (size === 4) buf.setUint32(off, v >>> 0, true);
                        else if (size === 2) buf.setUint16(off, v & 0xffff, true);
                        else buf.setUint8(off, v & 0xff);
                    }
                });
                return new Uint8Array(buf.buffer);
            };
            return;
        }

        if (d === '.ascii' || d === '.asciiz' || d === '.asciz' || d === '.string') {
            if (!ops.length) throw new AsmError(`"${d}" expects a string`);
            const bytes: number[] = [];
            ops.forEach(op => {
                if (!/^"(?:\\.|[^"\\])*"$/.test(op)) throw new AsmError(`invalid string ${op}`);
                bytes.push(...parseStringLiteral(op));
                if (d !== '.ascii') bytes.push(0);
            });
            s.bindPending(s.seg[s.cur]);
            st.addr = s.seg[s.cur];
            s.seg[s.cur] += bytes.length;
            st.emit = () => bytes;
            return;
        }

        if (d === '.space' || d === '.skip' || d === '.zero') {
            if (!ops.length) throw new AsmError(`"${d}" expects a size`);
            const n = s.evalExpr(parseExpr(ops[0]), true);
            if (n < 0 || n > 1 << 24) throw new AsmError(`invalid size ${n}`);
            s.bindPending(s.seg[s.cur]);
            st.addr = s.seg[s.cur];
            s.seg[s.cur] += n;
            st.emit = () => new Uint8Array(n);
            return;
        }
    }
}
