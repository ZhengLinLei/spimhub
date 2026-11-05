/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/ts/spim/isa.ts

    MIPS32 instruction set tables shared by the assembler, the disassembler
    and the CPU. Every real instruction is described once here, so the
    encoder (assembler) and the decoder (cpu / text segment view) can never
    disagree about a bit.

    © 2026 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

// ================== //
//  Registers         //
// ================== //
export const GPR_NAMES: readonly string[] = [
    'zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3',
    't0',   't1', 't2', 't3', 't4', 't5', 't6', 't7',
    's0',   's1', 's2', 's3', 's4', 's5', 's6', 's7',
    't8',   't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra',
];

export const GPR: Record<string, number> = {};
GPR_NAMES.forEach((name, i) => { GPR[name] = i; GPR[String(i)] = i; });
GPR.s8 = 30;    // Alias of $fp

// Coprocessor 0 registers (the ones SPIM exposes)
export const COP0: Record<string, number> = { badvaddr: 8, vaddr: 8, status: 12, cause: 13, epc: 14 };

// ================== //
//  Instruction table //
// ================== //
/*
    Operand spec letters:
        d, s, t  ->  GPR in rd / rs / rt
        D, S, T  ->  FPR in fd / fs / ft
        C        ->  Coprocessor 0 register in rd
        h        ->  Shift amount (5 bits)
        i        ->  Signed 16 bits immediate
        u        ->  Unsigned 16 bits immediate
        m        ->  Memory operand: offset(base)
        L        ->  Branch target (pc relative)
        J        ->  Jump target (pseudo direct)

    Kind:
        R   : SPECIAL    (opcode 0x00, funct)
        RI  : REGIMM     (opcode 0x01, rt)
        I   : I / J-type (opcode)
        S2  : SPECIAL2   (opcode 0x1c, funct)
        F   : COP1 arith (opcode 0x11, fmt, funct)
        BC  : COP1 branch(opcode 0x11, rs = 8, tf)
        FM  : COP1 move  (opcode 0x11, rs)
        C0  : COP0 move  (opcode 0x10, rs)
        X   : Fixed word
*/
export type Kind = 'R' | 'RI' | 'I' | 'S2' | 'F' | 'BC' | 'FM' | 'C0' | 'X';
export type OperandSpec = 'd' | 's' | 't' | 'D' | 'S' | 'T' | 'C' | 'h' | 'i' | 'u' | 'm' | 'L' | 'J';
type Code = number | [number, number];
type Row = [string, Kind, Code, string];

export interface InstrEntry {
    name: string;
    kind: Kind;
    code: Code;
    ops: OperandSpec[];
    base: number;
    key: string;
}

export const FMT = { s: 16, d: 17, w: 20 } as const;

export const TABLE: Row[] = [
    // ---- SPECIAL ----
    ['sll',     'R', 0x00, 'd,t,h'], ['srl',  'R', 0x02, 'd,t,h'], ['sra',  'R', 0x03, 'd,t,h'],
    ['sllv',    'R', 0x04, 'd,t,s'], ['srlv', 'R', 0x06, 'd,t,s'], ['srav', 'R', 0x07, 'd,t,s'],
    ['jr',      'R', 0x08, 's'],     ['jalr', 'R', 0x09, 'd,s'],
    ['movz',    'R', 0x0a, 'd,s,t'], ['movn', 'R', 0x0b, 'd,s,t'],
    ['syscall', 'R', 0x0c, ''],      ['break','R', 0x0d, ''],
    ['mfhi',    'R', 0x10, 'd'],     ['mthi', 'R', 0x11, 's'],
    ['mflo',    'R', 0x12, 'd'],     ['mtlo', 'R', 0x13, 's'],
    ['mult',    'R', 0x18, 's,t'],   ['multu','R', 0x19, 's,t'],
    ['div',     'R', 0x1a, 's,t'],   ['divu', 'R', 0x1b, 's,t'],
    ['add',     'R', 0x20, 'd,s,t'], ['addu', 'R', 0x21, 'd,s,t'],
    ['sub',     'R', 0x22, 'd,s,t'], ['subu', 'R', 0x23, 'd,s,t'],
    ['and',     'R', 0x24, 'd,s,t'], ['or',   'R', 0x25, 'd,s,t'],
    ['xor',     'R', 0x26, 'd,s,t'], ['nor',  'R', 0x27, 'd,s,t'],
    ['slt',     'R', 0x2a, 'd,s,t'], ['sltu', 'R', 0x2b, 'd,s,t'],
    ['teq',     'R', 0x34, 's,t'],   ['tne',  'R', 0x36, 's,t'],

    // ---- REGIMM ----
    ['bltz', 'RI', 0x00, 's,L'], ['bgez',   'RI', 0x01, 's,L'],
    ['bltzal','RI',0x10, 's,L'], ['bgezal', 'RI', 0x11, 's,L'],

    // ---- I / J ----
    ['j',     'I', 0x02, 'J'],     ['jal',   'I', 0x03, 'J'],
    ['beq',   'I', 0x04, 's,t,L'], ['bne',   'I', 0x05, 's,t,L'],
    ['blez',  'I', 0x06, 's,L'],   ['bgtz',  'I', 0x07, 's,L'],
    ['addi',  'I', 0x08, 't,s,i'], ['addiu', 'I', 0x09, 't,s,i'],
    ['slti',  'I', 0x0a, 't,s,i'], ['sltiu', 'I', 0x0b, 't,s,i'],
    ['andi',  'I', 0x0c, 't,s,u'], ['ori',   'I', 0x0d, 't,s,u'],
    ['xori',  'I', 0x0e, 't,s,u'], ['lui',   'I', 0x0f, 't,u'],
    ['lb',    'I', 0x20, 't,m'],   ['lh',    'I', 0x21, 't,m'],
    ['lwl',   'I', 0x22, 't,m'],   ['lw',    'I', 0x23, 't,m'],
    ['lbu',   'I', 0x24, 't,m'],   ['lhu',   'I', 0x25, 't,m'],
    ['lwr',   'I', 0x26, 't,m'],   ['sb',    'I', 0x28, 't,m'],
    ['sh',    'I', 0x29, 't,m'],   ['swl',   'I', 0x2a, 't,m'],
    ['sw',    'I', 0x2b, 't,m'],   ['swr',   'I', 0x2e, 't,m'],
    ['ll',    'I', 0x30, 't,m'],   ['lwc1',  'I', 0x31, 'T,m'],
    ['ldc1',  'I', 0x35, 'T,m'],   ['sc',    'I', 0x38, 't,m'],
    ['swc1',  'I', 0x39, 'T,m'],   ['sdc1',  'I', 0x3d, 'T,m'],

    // ---- SPECIAL2 ----
    ['madd', 'S2', 0x00, 's,t'], ['maddu', 'S2', 0x01, 's,t'],
    ['mul',  'S2', 0x02, 'd,s,t'],
    ['msub', 'S2', 0x04, 's,t'], ['msubu', 'S2', 0x05, 's,t'],
    ['clz',  'S2', 0x20, 'd,s'], ['clo',   'S2', 0x21, 'd,s'],

    // ---- COP1 branch / move ----
    ['bc1f', 'BC', 0, 'L'], ['bc1t', 'BC', 1, 'L'],
    ['mfc1', 'FM', 0, 't,S'], ['mtc1', 'FM', 4, 't,S'],

    // ---- COP0 ----
    ['mfc0', 'C0', 0, 't,C'], ['mtc0', 'C0', 4, 't,C'],
    ['eret', 'X', 0x42000018, ''],
];

// ---- COP1 arithmetic (generated for .s and .d) ----
([
    ['add', 0x00, 'D,S,T'], ['sub', 0x01, 'D,S,T'], ['mul', 0x02, 'D,S,T'], ['div', 0x03, 'D,S,T'],
    ['sqrt', 0x04, 'D,S'],  ['abs', 0x05, 'D,S'],   ['mov', 0x06, 'D,S'],   ['neg', 0x07, 'D,S'],
    ['round.w', 0x0c, 'D,S'], ['trunc.w', 0x0d, 'D,S'], ['ceil.w', 0x0e, 'D,S'], ['floor.w', 0x0f, 'D,S'],
    ['c.eq', 0x32, 'S,T'],  ['c.lt', 0x3c, 'S,T'],  ['c.le', 0x3e, 'S,T'],
] as [string, number, string][]).forEach(([name, fn, ops]) => {
    TABLE.push([`${name}.s`, 'F', [FMT.s, fn], ops]);
    TABLE.push([`${name}.d`, 'F', [FMT.d, fn], ops]);
});
TABLE.push(
    ['cvt.s.d', 'F', [FMT.d, 0x20], 'D,S'], ['cvt.s.w', 'F', [FMT.w, 0x20], 'D,S'],
    ['cvt.d.s', 'F', [FMT.s, 0x21], 'D,S'], ['cvt.d.w', 'F', [FMT.w, 0x21], 'D,S'],
    ['cvt.w.s', 'F', [FMT.s, 0x24], 'D,S'], ['cvt.w.d', 'F', [FMT.d, 0x24], 'D,S'],
);

// ================== //
//  Lookup maps       //
// ================== //
export const BY_NAME: Record<string, InstrEntry> = {};     // name -> entry
export const BY_KEY: Record<string, InstrEntry> = {};      // decode key -> entry

const keyOf = (kind: Kind, code: Code): string => {
    switch (kind) {
        case 'F': return `F${(code as number[])[0]}.${(code as number[])[1]}`;
        default:  return `${kind}${code}`;
    }
};

const baseOf = (kind: Kind, code: Code): number => {
    const c = code as number, f = code as [number, number];
    switch (kind) {
        case 'R':  return c;
        case 'RI': return ((0x01 << 26) | (c << 16)) >>> 0;
        case 'I':  return (c << 26) >>> 0;
        case 'S2': return ((0x1c << 26) | c) >>> 0;
        case 'F':  return ((0x11 << 26) | (f[0] << 21) | f[1]) >>> 0;
        case 'BC': return ((0x11 << 26) | (8 << 21) | (c << 16)) >>> 0;
        case 'FM': return ((0x11 << 26) | (c << 21)) >>> 0;
        case 'C0': return ((0x10 << 26) | (c << 21)) >>> 0;
        case 'X':  return c >>> 0;
    }
};

TABLE.forEach(([name, kind, code, ops]) => {
    const entry: InstrEntry = {
        name, kind, code,
        ops: (ops ? ops.split(',') : []) as OperandSpec[],
        base: baseOf(kind, code),
        key: keyOf(kind, code),
    };
    BY_NAME[name] = entry;
    BY_KEY[entry.key] = entry;
});

// ================== //
//  Decoder           //
// ================== //
export interface Fields {
    word: number;
    op: number; rs: number; rt: number; rd: number; sa: number; fn: number;
    imm: number; simm: number; target: number;
    fmt: number; ft: number; fs: number; fd: number;
    entry: InstrEntry | null;
}

/**
 * @desc: Splits a machine word in all of its fields
 * @param: word {:number} - 32 bits instruction
 * @return: {:Fields} - Fields + matching table entry (or null)
*/
export const decode = (word: number): Fields => {
    word >>>= 0;
    const rs = (word >>> 21) & 31, rt = (word >>> 16) & 31, rd = (word >>> 11) & 31, sa = (word >>> 6) & 31;
    const f: Fields = {
        word,
        op: word >>> 26,
        rs, rt, rd, sa,
        fn: word & 63,
        imm: word & 0xffff,
        simm: (word << 16) >> 16,
        target: word & 0x03ffffff,
        // FPU aliases
        fmt: rs, ft: rt, fs: rd, fd: sa,
        entry: null,
    };

    let key: string;
    switch (f.op) {
        case 0x00: key = `R${f.fn}`; break;
        case 0x01: key = `RI${f.rt}`; break;
        case 0x1c: key = `S2${f.fn}`; break;
        case 0x10: key = (word === 0x42000018) ? `X${word}` : `C0${f.rs}`; break;
        case 0x11:
            if (f.rs === 8) key = `BC${f.rt & 1}`;
            else if (f.rs === 0 || f.rs === 4) key = `FM${f.rs}`;
            else key = `F${f.rs}.${f.fn}`;
            break;
        default: key = `I${f.op}`;
    }
    f.entry = BY_KEY[key] || null;
    return f;
};

export const hex = (n: number, pad = 8): string => '0x' + (n >>> 0).toString(16).padStart(pad, '0');

/**
 * @desc: Disassembles a machine word into SPIM-like basic syntax (register numbers)
 * @param: word {:number} - 32 bits instruction
 * @param: pc {:number} - Address of the instruction (for branch targets)
 * @return: {:string}
*/
export const disassemble = (word: number, pc = 0): string => {
    if ((word >>> 0) === 0) return 'nop';
    const f = decode(word);
    const e = f.entry;
    if (!e) return `.word ${hex(word)}`;

    const parts = e.ops.map((op): string => {
        switch (op) {
            case 'd': return `$${f.rd}`;
            case 's': return `$${f.rs}`;
            case 't': return `$${f.rt}`;
            case 'D': return `$f${f.fd}`;
            case 'S': return `$f${f.fs}`;
            case 'T': return `$f${f.ft}`;
            case 'C': return `$${f.rd}`;
            case 'h': return `${f.sa}`;
            case 'i': return `${f.simm}`;
            case 'u': return `${f.imm}`;
            case 'm': return `${f.simm}($${f.rs})`;
            case 'L': return hex(pc + 4 + (f.simm << 2));
            case 'J': return hex(((pc + 4) & 0xf0000000) | (f.target << 2));
        }
    });
    return parts.length ? `${e.name} ${parts.join(', ')}` : e.name;
};
