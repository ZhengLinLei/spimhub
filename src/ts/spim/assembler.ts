/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/ts/spim/assembler.ts

    Two pass MIPS32 assembler.

        Pass 1 : parse every line, bind labels, compute the size of every
                 statement (pseudo instructions included).
        Pass 2 : evaluate expressions, expand pseudo instructions and encode
                 real machine words + data bytes.

    © 2026 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { GPR, COP0, BY_NAME, disassemble, hex } from './isa';

// ================== //
//  Memory map        //
// ================== //
export const SEGMENT = {
    text:  0x00400000,
    data:  0x10010000,
    ktext: 0x80000180,
    kdata: 0x90000000,
} as const;

type SegmentName = keyof typeof SEGMENT;

const AT = 1, RA = 31, ZERO = 0;

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
const fitsS16 = (v: number) => v >= -32768 && v <= 32767;
const fitsU16 = (v: number) => v >= 0 && v <= 0xffff;
const hi16 = (v: number) => (v >>> 16) & 0xffff;
const lo16 = (v: number) => v & 0xffff;
// %hi() with carry adjustment, so that  lui + signed offset  rebuilds v
const hiAdj = (v: number) => (((v >>> 0) + 0x8000) >>> 16) & 0xffff;
const loS = (v: number) => (v << 16) >> 16;

const ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, '"': 34, "'": 39, a: 7, b: 8, f: 12, v: 11 };

const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/**
 * @desc: Decodes a quoted string literal (with escapes) into byte codes
*/
const parseStringLiteral = (lit: string): number[] => {
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
const splitOperands = (s: string): string[] => {
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
    | { k: 'bin'; op: string; l: Expr; r: Expr };

type Token = { k: 'num'; v: number } | { k: 'sym'; v: string } | { k: 'op'; v: string };

const TOKEN_RE = /\s*(?:(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+\.\d*(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+|\.\d+(?:[eE][-+]?\d+)?|\d+)|('(?:\\.|[^'\\])')|([A-Za-z_.$][\w.$]*)|(<<|>>|[-+*/%&|^~()]))/y;

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
        } else {
            toks.push({ k: 'op', v: m[4] });
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
        if (isOp('(')) {
            i++;
            const e = or();
            if (!isOp(')')) throw new AsmError(`missing ")" in "${src}"`);
            i++;
            return e;
        }
        const t = toks[i++];
        if (!t || t.k === 'op') throw new AsmError(`invalid expression "${src}"`);
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
    if (e.k === 'un') exprSymbols(e.e, out);
    return out;
};

// ================== //
//  Operands          //
// ================== //
/*
    Parsed operands carry an expression (`expr`); resolved operands carry a
    value (`v`). The pseudo expander works with both.
*/
type RegOp = { t: 'reg'; n: number; src?: string; expr?: undefined };
type FregOp = { t: 'freg'; n: number; src?: string; expr?: undefined };
type ImmOp = { t: 'imm'; v?: number; expr?: Expr; src?: string };
type MemOp = { t: 'mem'; v?: number; expr?: Expr | null; base: number; src?: string };
type Operand = RegOp | FregOp | ImmOp | MemOp;
type Valued = ImmOp | MemOp;

/**
 * @desc: Parses a register name ($t0, $8, $f2...). Returns null if not a register.
*/
const parseRegister = (s: string): RegOp | FregOp | null => {
    const m = /^\$([A-Za-z0-9]+)$/.exec(s.trim());
    if (!m) return null;
    const name = m[1].toLowerCase();
    if (/^f\d+$/.test(name)) {
        const n = +name.slice(1);
        if (n > 31) throw new AsmError(`invalid register "${s}"`);
        return { t: 'freg', n };
    }
    if (name in GPR) return { t: 'reg', n: GPR[name] };
    if (name in COP0) return { t: 'reg', n: COP0[name] };
    throw new AsmError(`invalid register "${s}"`);
};

/**
 * @desc: Parses one operand into { t: reg | freg | imm | mem }
*/
const parseOperand = (s: string): Operand => {
    s = s.trim();
    if (s === '') throw new AsmError('missing operand');
    const reg = parseRegister(s);
    if (reg) return reg;

    // offset(base) | (base)
    const mem = /^(.*?)\(\s*(\$[A-Za-z0-9]+)\s*\)$/.exec(s);
    if (mem) {
        const base = parseRegister(mem[2]);
        if (!base || base.t !== 'reg') throw new AsmError(`invalid base register "${mem[2]}"`);
        return { t: 'mem', expr: mem[1].trim() ? parseExpr(mem[1]) : null, base: base.n, src: s };
    }
    if (s.startsWith('$')) throw new AsmError(`invalid register "${s}"`);
    return { t: 'imm', expr: parseExpr(s), src: s };
};

// ================== //
//  Pseudo / forms    //
// ================== //
/*
    expand(mn, ops, ctx) returns a list of real instructions:
        [ [name, [operand, ...], extraBits?], ... ]

    ctx.val(op)    -> numeric value of an imm / mem offset (0 in pass 1 if unknown)
    ctx.isLong(op) -> pass 1 decides between the short and the long encoding
                      (unknown values = long), pass 2 replays the decision
*/
type Real = [string, Operand[], number?];

interface Ctx {
    val(op: Operand, allowFloat?: boolean): number;
    isLong(op: Operand, compute: () => boolean): boolean;
}

const R = (n: number): RegOp => ({ t: 'reg', n });
const F = (n: number): FregOp => ({ t: 'freg', n });
const I = (v: number): ImmOp => ({ t: 'imm', v });
const M = (v: number, base: number): MemOp => ({ t: 'mem', v, base });

const isReg = (o?: Operand): o is RegOp => !!o && o.t === 'reg';
const isFreg = (o?: Operand): o is FregOp => !!o && o.t === 'freg';
const isImm = (o?: Operand): o is ImmOp => !!o && o.t === 'imm';
const isMem = (o?: Operand): o is MemOp => !!o && o.t === 'mem';

const SIGNED_IMM: Record<string, string> = { addi: 'add', addiu: 'addu', slti: 'slt', sltiu: 'sltu' };
const LOGIC_IMM: Record<string, string> = { andi: 'and', ori: 'or', xori: 'xor' };
const R_TO_IMM: Record<string, string> = { add: 'addi', addu: 'addiu', slt: 'slti', sltu: 'sltiu', and: 'andi', or: 'ori', xor: 'xori' };
const MEM_OPS = ['lb', 'lbu', 'lh', 'lhu', 'lw', 'lwl', 'lwr', 'll', 'sb', 'sh', 'sw', 'swl', 'swr', 'sc',
                 'lwc1', 'swc1', 'ldc1', 'sdc1'];
const MEM_ALIAS: Record<string, string> = { 'l.s': 'lwc1', 's.s': 'swc1', 'l.d': 'ldc1', 's.d': 'sdc1' };
const BRANCH_CMP: Record<string, [string, boolean, string]> = {
    //        slt kind, swap operands, branch if $at != 0
    blt:  ['slt',  false, 'bne'], bltu: ['sltu', false, 'bne'],
    bgt:  ['slt',  true,  'bne'], bgtu: ['sltu', true,  'bne'],
    ble:  ['slt',  true,  'beq'], bleu: ['sltu', true,  'beq'],
    bge:  ['slt',  false, 'beq'], bgeu: ['sltu', false, 'beq'],
};

function want(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new AsmError(msg);
}

/**
 * @desc: Loads a 32 bits constant into register rd (1 or 2 instructions)
*/
const loadImm = (rd: number, op: Operand, ctx: Ctx, useAt = true): Real[] => {
    const v = ctx.val(op) | 0;
    const long = ctx.isLong(op, () => !(fitsS16(v) || fitsU16(v) || lo16(v) === 0));
    if (!long) {
        if (fitsS16(v)) return [['addiu', [R(rd), R(ZERO), I(v)]]];
        if (fitsU16(v)) return [['ori', [R(rd), R(ZERO), I(v)]]];
        return [['lui', [R(rd), I(hi16(v))]]];
    }
    const tmp = useAt ? AT : rd;
    return [['lui', [R(tmp), I(hi16(v))]], ['ori', [R(rd), R(tmp), I(lo16(v))]]];
};

/**
 * @desc: Returns [regNumber, prefixInstructions] for an operand that may be
 *        a register or an immediate (immediates are loaded into $at)
*/
const asReg = (op: Operand, ctx: Ctx): [number, Real[]] => {
    if (isReg(op)) return [op.n, []];
    want(isImm(op), `invalid operand "${op.src || '?'}"`);
    return [AT, loadImm(AT, op, ctx)];
};

/**
 * @desc: Memory access with any addressing mode (label, label+k, k($r), label($r)...)
*/
const memAccess = (mn: string, rt: Operand, addr: Operand, ctx: Ctx): Real[] => {
    if (isMem(addr) && addr.expr === null) return [[mn, [rt, M(0, addr.base)]]];
    want(isMem(addr) || isImm(addr), `invalid address for "${mn}"`);
    const base = isMem(addr) ? addr.base : ZERO;
    const v = ctx.val(addr) | 0;
    const long = ctx.isLong(addr, () => !fitsS16(v));
    if (!long) return [[mn, [rt, M(v, base)]]];
    const out: Real[] = [['lui', [R(AT), I(hiAdj(v))]]];
    if (base !== ZERO) out.push(['addu', [R(AT), R(AT), R(base)]]);
    out.push([mn, [rt, M(loS(v), AT)]]);
    return out;
};

/**
 * @desc: Expands a statement into real instructions
*/
const expand = (mn: string, ops: Operand[], ctx: Ctx): Real[] => {
    const n = ops.length;
    const o = ops;

    // ---- Memory operations (all addressing modes) ----
    if (mn in MEM_ALIAS) mn = MEM_ALIAS[mn];
    if (MEM_OPS.includes(mn)) {
        want(n === 2, `"${mn}" expects 2 operands`);
        const fp = ['lwc1', 'swc1', 'ldc1', 'sdc1'].includes(mn);
        want(fp ? isFreg(o[0]) : isReg(o[0]), `"${mn}" first operand must be a ${fp ? 'float' : 'general'} register`);
        return memAccess(mn, o[0], o[1], ctx);
    }

    switch (mn) {
        // ---- Data movement ----
        case 'nop': return [['sll', [R(0), R(0), I(0)]]];
        case 'move':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"move" expects 2 registers');
            return [['addu', [o[0], R(ZERO), o[1]]]];
        case 'li': {
            const [d, v] = o;
            want(n === 2 && isReg(d) && isImm(v), '"li" expects a register and an immediate');
            return loadImm(d.n, v, ctx);
        }
        case 'la': {
            const [d, a] = o;
            want(n === 2 && isReg(d), '"la" expects a register and an address');
            if (isMem(a)) {
                const v = a.expr ? ctx.val(a) | 0 : 0;
                const long = ctx.isLong(a, () => !fitsS16(v));
                if (!long) return [['addiu', [d, R(a.base), I(v)]]];
                return [['lui', [R(AT), I(hi16(v))]], ['ori', [R(AT), R(AT), I(lo16(v))]],
                        ['addu', [d, R(AT), R(a.base)]]];
            }
            want(isImm(a), '"la" expects an address');
            const v = ctx.val(a) | 0;
            return [['lui', [R(AT), I(hi16(v))]], ['ori', [d, R(AT), I(lo16(v))]]];
        }
        case 'li.s': case 'li.d': {
            const [d, v] = o;
            want(n === 2 && isFreg(d) && isImm(v), `"${mn}" expects a float register and a number`);
            const val = ctx.val(v, true);
            const buf = new DataView(new ArrayBuffer(8));
            if (mn === 'li.s') {
                buf.setFloat32(0, val);
                const w = buf.getUint32(0);
                return [['lui', [R(AT), I(hi16(w))]], ['ori', [R(AT), R(AT), I(lo16(w))]], ['mtc1', [R(AT), d]]];
            }
            want(d.n % 2 === 0, '"li.d" needs an even float register');
            buf.setFloat64(0, val);
            const h = buf.getUint32(0), l = buf.getUint32(4);
            return [['lui', [R(AT), I(hi16(l))]], ['ori', [R(AT), R(AT), I(lo16(l))]], ['mtc1', [R(AT), d]],
                    ['lui', [R(AT), I(hi16(h))]], ['ori', [R(AT), R(AT), I(lo16(h))]], ['mtc1', [R(AT), F(d.n + 1)]]];
        }

        // ---- Arithmetic / logic ----
        case 'neg': case 'negu':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), `"${mn}" expects 2 registers`);
            return [[mn === 'neg' ? 'sub' : 'subu', [o[0], R(ZERO), o[1]]]];
        case 'not':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"not" expects 2 registers');
            return [['nor', [o[0], o[1], R(ZERO)]]];
        case 'abs':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"abs" expects 2 registers');
            return [['sra', [R(AT), o[1], I(31)]], ['xor', [o[0], o[1], R(AT)]], ['subu', [o[0], o[0], R(AT)]]];
        case 'subi': case 'subiu': {
            const imm = o[2];
            want(n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(imm) && imm.expr, `"${mn}" expects rd, rs, imm`);
            const neg: ImmOp = { t: 'imm', expr: { k: 'un', op: '-', e: imm.expr }, src: imm.src };
            return expand(mn === 'subi' ? 'addi' : 'addiu', [o[0], o[1], neg], ctx);
        }
        case 'mul': {
            if (n === 3 && isReg(o[2])) break;  // real SPECIAL2 mul
            want(n === 3 && isReg(o[0]) && isReg(o[1]), '"mul" expects rd, rs, rt|imm');
            const [r, pre] = asReg(o[2], ctx);
            return [...pre, ['mul', [o[0], o[1], R(r)]]];
        }
        case 'div': case 'divu': case 'rem': case 'remu': {
            if (n === 2 && (mn === 'div' || mn === 'divu')) break;  // real instruction
            want(n === 3 && isReg(o[0]) && isReg(o[1]), `"${mn}" expects rd, rs, rt|imm`);
            const real = mn.endsWith('u') ? 'divu' : 'div';
            const [r, pre] = asReg(o[2], ctx);
            return [...pre, [real, [o[1], R(r)]], [mn.startsWith('rem') ? 'mfhi' : 'mflo', [o[0]]]];
        }
        case 'mulo': case 'mulou':
            want(n === 3 && isReg(o[0]) && isReg(o[1]) && isReg(o[2]), `"${mn}" expects 3 registers`);
            return [[mn === 'mulo' ? 'mult' : 'multu', [o[1], o[2]]], ['mflo', [o[0]]]];
        case 'rol': case 'ror': {
            want(n === 3 && isReg(o[0]) && isReg(o[1]), `"${mn}" expects rd, rs, rt|imm`);
            if (isImm(o[2])) {
                const s = ctx.val(o[2]) & 31;
                const [a, b] = mn === 'rol' ? ['srl', 'sll'] : ['sll', 'srl'];
                return [[a, [R(AT), o[1], I((32 - s) & 31)]], [b, [o[0], o[1], I(s)]], ['or', [o[0], o[0], R(AT)]]];
            }
            const [a, b] = mn === 'rol' ? ['srlv', 'sllv'] : ['sllv', 'srlv'];
            return [['subu', [R(AT), R(ZERO), o[2]]], [a, [R(AT), o[1], R(AT)]], [b, [o[0], o[1], o[2]]], ['or', [o[0], o[0], R(AT)]]];
        }

        // ---- Set pseudo instructions ----
        case 'seq': case 'sne': case 'sgt': case 'sgtu': case 'sge': case 'sgeu': case 'sle': case 'sleu': {
            want(n === 3 && isReg(o[0]) && isReg(o[1]), `"${mn}" expects rd, rs, rt|imm`);
            const [r, pre] = asReg(o[2], ctx);
            const u = mn.endsWith('u') ? 'sltu' : 'slt';
            const d = o[0], s = o[1], t = R(r);
            switch (mn) {
                case 'seq': return [...pre, ['xor', [d, s, t]], ['sltiu', [d, d, I(1)]]];
                case 'sne': return [...pre, ['xor', [d, s, t]], ['sltu', [d, R(ZERO), d]]];
                case 'sgt': case 'sgtu': return [...pre, [u, [d, t, s]]];
                case 'sge': case 'sgeu': return [...pre, [u, [d, s, t]], ['xori', [d, d, I(1)]]];
                default: return [...pre, [u, [d, t, s]], ['xori', [d, d, I(1)]]];   // sle, sleu
            }
        }

        // ---- Branches ----
        case 'b':
            want(n === 1 && isImm(o[0]), '"b" expects a label');
            return [['beq', [R(ZERO), R(ZERO), o[0]]]];
        case 'bal':
            want(n === 1 && isImm(o[0]), '"bal" expects a label');
            return [['bgezal', [R(ZERO), o[0]]]];
        case 'beqz': case 'bnez':
            want(n === 2 && isReg(o[0]) && isImm(o[1]), `"${mn}" expects a register and a label`);
            return [[mn === 'beqz' ? 'beq' : 'bne', [o[0], R(ZERO), o[1]]]];
        case 'beq': case 'bne': {
            if (n === 3 && isReg(o[1])) break;
            want(n === 3 && isReg(o[0]) && isImm(o[1]) && isImm(o[2]), `"${mn}" expects rs, rt|imm, label`);
            const [r, pre] = asReg(o[1], ctx);
            return [...pre, [mn, [o[0], R(r), o[2]]]];
        }
        case 'blt': case 'bltu': case 'bgt': case 'bgtu': case 'ble': case 'bleu': case 'bge': case 'bgeu': {
            want(n === 3 && isReg(o[0]) && isImm(o[2]), `"${mn}" expects rs, rt|imm, label`);
            const [kind, swap, br] = BRANCH_CMP[mn];
            const [r, pre] = asReg(o[1], ctx);
            const [a, b] = swap ? [R(r), o[0]] : [o[0], R(r)];
            return [...pre, [kind, [R(AT), a, b]], [br, [R(AT), R(ZERO), o[2]]]];
        }

        // ---- Jumps with register operands ----
        case 'j':
            if (n === 1 && isReg(o[0])) return [['jr', [o[0]]]];
            break;
        case 'jal': case 'jalr':
            if (n === 1 && isReg(o[0])) return [['jalr', [R(RA), o[0]]]];
            break;

        // ---- Shifts with a register amount ----
        case 'sll': case 'srl': case 'sra':
            if (n === 3 && isReg(o[2])) return [[mn + 'v', [o[0], o[1], o[2]]]];
            break;

        case 'break':
            if (n === 1 && isImm(o[0])) return [['break', [], (ctx.val(o[0]) & 0xfffff) << 6]];
            break;
    }

    // ---- Two operand shorthand:  add $t0, $t1  ->  add $t0, $t0, $t1 ----
    const entry = BY_NAME[mn];
    if (entry && entry.ops.length === 3 && n === 2 && /^[dt],[st],[ti]$/.test(entry.ops.join(','))) {
        return expand(mn, [o[0], o[0], o[1]], ctx);
    }

    // ---- Immediate forms that do not fit in 16 bits ----
    if (mn in SIGNED_IMM || mn in LOGIC_IMM) {
        const imm = o[2];
        want(n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(imm), `"${mn}" expects rt, rs, imm`);
        const v = ctx.val(imm) | 0;
        const fits = mn in SIGNED_IMM ? fitsS16(v) : fitsU16(v);
        if (!ctx.isLong(imm, () => !fits)) return [[mn, [o[0], o[1], I(v)]]];
        const real = SIGNED_IMM[mn] || LOGIC_IMM[mn];
        return [...loadImm(AT, imm, ctx), [real, [o[0], o[1], R(AT)]]];
    }

    // ---- R-type used with an immediate:  add $t0, $t1, 5 ----
    if (n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(o[2])) {
        if (mn in R_TO_IMM) return expand(R_TO_IMM[mn], o, ctx);
        if (mn === 'sub' || mn === 'subu') return expand(mn === 'sub' ? 'subi' : 'subiu', o, ctx);
        if (mn === 'nor') {
            const [r, pre] = asReg(o[2], ctx);
            return [...pre, ['nor', [o[0], o[1], R(r)]]];
        }
    }

    if (!entry) throw new AsmError(`unknown instruction "${mn}"`);
    return [[mn, o.map(op => resolve(op, ctx))]];
};

const resolve = (op: Operand, ctx: Ctx): Operand => {
    if (op.expr === undefined) return op;   // Already resolved
    if (isImm(op)) return I(ctx.val(op));
    if (isMem(op)) return M(op.expr ? ctx.val(op) : 0, op.base);
    return op;
};

// ================== //
//  Encoder           //
// ================== //
// Is the float operand `spec` of `mn` a double (even register pair)?
const isDoubleOperand = (mn: string, spec: string): boolean => {
    if (mn === 'ldc1' || mn === 'sdc1') return true;
    const cvt = /^cvt\.([sdw])\.([sdw])$/.exec(mn);
    if (cvt) return (spec === 'D' ? cvt[1] : cvt[2]) === 'd';
    if (/^(round|trunc|ceil|floor)\.w\.d$/.test(mn)) return spec !== 'D';
    return mn.endsWith('.d');
};

/**
 * @desc: Encodes a real instruction into a 32 bits word
*/
export const encode = (mn: string, ops: Operand[], pc: number, extra = 0): number => {
    const e = BY_NAME[mn];
    if (!e) throw new AsmError(`unknown instruction "${mn}"`);
    if (ops.length !== e.ops.length) {
        throw new AsmError(`"${mn}" expects ${e.ops.length} operand(s): ${e.ops.join(', ').replace(/m/, 'offset(base)') || 'none'}`);
    }
    let w = e.base | extra;
    const value = (op: ImmOp | MemOp) => op.v as number;

    e.ops.forEach((spec, i) => {
        const op = ops[i];
        const bad = (what: string) => new AsmError(`"${mn}" operand ${i + 1} must be ${what}`);
        switch (spec) {
            case 'd': case 's': case 't': case 'C': {
                if (!isReg(op)) throw bad('a general register');
                w |= op.n << { d: 11, s: 21, t: 16, C: 11 }[spec];
                break;
            }
            case 'D': case 'S': case 'T': {
                if (!isFreg(op)) throw bad('a float register ($f0-$f31)');
                if (isDoubleOperand(mn, spec) && op.n % 2) throw new AsmError(`"${mn}" needs even float registers ($f${op.n})`);
                w |= op.n << { D: 6, S: 11, T: 16 }[spec];
                break;
            }
            case 'h': {
                if (!isImm(op)) throw bad('a shift amount');
                const v = value(op);
                if (v < 0 || v > 31) throw new AsmError(`shift amount ${v} out of range (0..31)`);
                w |= v << 6;
                break;
            }
            case 'i': {
                if (!isImm(op)) throw bad('an immediate');
                const v = value(op);
                if (!fitsS16(v)) throw new AsmError(`immediate ${v} out of range (-32768..32767)`);
                w |= v & 0xffff;
                break;
            }
            case 'u': {
                if (!isImm(op)) throw bad('an immediate');
                const v = value(op);
                if (!fitsU16(v) && !fitsS16(v)) throw new AsmError(`immediate ${v} out of range (0..65535)`);
                w |= v & 0xffff;
                break;
            }
            case 'm': {
                if (!isMem(op)) throw bad('a memory operand offset(base)');
                const v = value(op);
                if (!fitsS16(v)) throw new AsmError(`offset ${v} out of range (-32768..32767)`);
                w |= (op.base << 21) | (v & 0xffff);
                break;
            }
            case 'L': {
                if (!isImm(op)) throw bad('a label');
                const v = value(op);
                const off = ((v >>> 0) - (pc + 4)) / 4;
                if (!Number.isInteger(off)) throw new AsmError(`branch target ${hex(v)} is not word aligned`);
                if (off < -32768 || off > 32767) throw new AsmError(`branch target ${hex(v)} out of range`);
                w |= off & 0xffff;
                break;
            }
            case 'J': {
                if (!isImm(op)) throw bad('a label');
                const t = value(op) >>> 0;
                if (t & 3) throw new AsmError(`jump target ${hex(t)} is not word aligned`);
                if ((t & 0xf0000000) !== ((pc + 4) & 0xf0000000)) throw new AsmError(`jump target ${hex(t)} out of range`);
                w |= (t >>> 2) & 0x03ffffff;
                break;
            }
        }
    });

    // clz / clo need rt == rd
    if (mn === 'clz' || mn === 'clo') w |= ((w >>> 11) & 31) << 16;

    return w >>> 0;
};

// ================== //
//  Assembler         //
// ================== //
const DIRECTIVES = new Set([
    '.data', '.text', '.kdata', '.ktext', '.rdata', '.sdata',
    '.word', '.half', '.hword', '.short', '.2byte', '.4byte', '.byte', '.float', '.double',
    '.ascii', '.asciiz', '.string', '.space', '.skip', '.align', '.balign',
    '.globl', '.global', '.extern', '.ent', '.end', '.set', '.eqv', '.equ', '.file', '.section',
]);
const DATA_SIZE: Record<string, number> = { '.word': 4, '.4byte': 4, '.half': 2, '.hword': 2, '.short': 2, '.2byte': 2, '.byte': 1, '.float': 4, '.double': 8 };
const STARTUP = [
    // SPIM like start up code: it calls main and exits when main returns
    'lw $a0, 0($sp)', 'addiu $a1, $sp, 4', 'addiu $a2, $a1, 4', 'sll $v0, $a0, 2',
    'addu $a2, $a2, $v0', 'jal main', 'nop', 'li $v0, 10', 'syscall',
];

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
    static encode = encode;

    /**
     * @desc: Assembles MIPS source code
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
            const boot: Statement[] = STARTUP.map((src) => {
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
            if (!stmt.parsed) stmt.parsed = stmt.ops.map(parseOperand);
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
                st.size = expand(st.mn, parseOps(st), makeCtx(1, st)).length;
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
                const out = expand(st.mn, parseOps(st), ctx);
                if (out.length !== st.size) throw new AsmError('internal error: pseudo instruction size changed');
                out.forEach(([mn, ops, extra], k) => {
                    const pc = st.addr! + 4 * k;
                    const word = encode(mn, ops.map(op => resolve(op, ctx)), pc, extra);
                    text.push({
                        addr: pc, word,
                        basic: disassemble(word, pc),
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
            case '.align': case '.balign': {
                if (!ops.length) throw new AsmError(`"${d}" expects a number`);
                const n = s.evalExpr(parseExpr(ops[0]), true);
                const bytes = d === '.align' ? 1 << n : n;
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

        if (d === '.ascii' || d === '.asciiz' || d === '.string') {
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

        if (d === '.space' || d === '.skip') {
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
