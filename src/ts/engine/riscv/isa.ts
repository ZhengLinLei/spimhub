/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/riscv/isa.ts

    RV32IM instruction set: table, encoder helpers, decoder, disassembler
    and register dependencies (pipeline).

        31        25 24   20 19   15 14  12 11        7 6       0
        [ funct7    |  rs2  |  rs1  | f3   |    rd     | opcode ]   R
        [ imm[11:0]         |  rs1  | f3   |    rd     | opcode ]   I
        [ imm[11:5] |  rs2  |  rs1  | f3   | imm[4:0]  | opcode ]   S
        [ imm[12|10:5] | rs2 | rs1  | f3   | imm[4:1|11]| opcode ]  B
        [ imm[31:12]                       |    rd     | opcode ]   U
        [ imm[20|10:1|11|19:12]            |    rd     | opcode ]   J

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import type { Deps } from '../pipeline/pipeline';

// ================== //
//  Registers         //
// ================== //
export const ABI_NAMES: readonly string[] = [
    'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
    's0',   's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5',
    'a6',   'a7', 's2', 's3', 's4', 's5', 's6', 's7',
    's8',   's9', 's10', 's11', 't3', 't4', 't5', 't6',
];

export const XREG: Record<string, number> = {};
ABI_NAMES.forEach((name, i) => { XREG[name] = i; XREG[`x${i}`] = i; });
XREG.fp = 8;    // Alias of s0

export const regName = (id: number): string => ABI_NAMES[id] ?? `x${id}`;

// ================== //
//  Instruction table //
// ================== //
/*
    Operand spec letters:
        d, s, t  ->  rd / rs1 / rs2
        i        ->  12 bits signed immediate (I-type)
        h        ->  shift amount (5 bits)
        m        ->  memory operand imm(rs1) for loads / jalr (I-type)
        M        ->  memory operand imm(rs1) for stores (S-type)
        L        ->  branch target (B-type, pc relative)
        J        ->  jump target (J-type, pc relative)
        u        ->  20 bits upper immediate (U-type)
*/
export type Format = 'R' | 'I' | 'IS' | 'S' | 'B' | 'U' | 'J' | 'SYS';
export type OperandSpec = 'd' | 's' | 't' | 'i' | 'h' | 'm' | 'M' | 'L' | 'J' | 'u';

export interface InstrEntry {
    name: string;
    format: Format;
    opcode: number;
    funct3: number;
    funct7: number;
    ops: OperandSpec[];
    base: number;
}

const OP = {
    LOAD: 0x03, FENCE: 0x0f, OPIMM: 0x13, AUIPC: 0x17, STORE: 0x23, OP: 0x33,
    LUI: 0x37, BRANCH: 0x63, JALR: 0x67, JAL: 0x6f, SYSTEM: 0x73,
} as const;

type Row = [string, Format, number, number, number, string];
const TABLE: Row[] = [
    // ---- RV32I: register / register ----
    ['add',  'R', OP.OP, 0, 0x00, 'd,s,t'], ['sub',  'R', OP.OP, 0, 0x20, 'd,s,t'],
    ['sll',  'R', OP.OP, 1, 0x00, 'd,s,t'], ['slt',  'R', OP.OP, 2, 0x00, 'd,s,t'],
    ['sltu', 'R', OP.OP, 3, 0x00, 'd,s,t'], ['xor',  'R', OP.OP, 4, 0x00, 'd,s,t'],
    ['srl',  'R', OP.OP, 5, 0x00, 'd,s,t'], ['sra',  'R', OP.OP, 5, 0x20, 'd,s,t'],
    ['or',   'R', OP.OP, 6, 0x00, 'd,s,t'], ['and',  'R', OP.OP, 7, 0x00, 'd,s,t'],
    // ---- RV32M ----
    ['mul',    'R', OP.OP, 0, 0x01, 'd,s,t'], ['mulh',   'R', OP.OP, 1, 0x01, 'd,s,t'],
    ['mulhsu', 'R', OP.OP, 2, 0x01, 'd,s,t'], ['mulhu',  'R', OP.OP, 3, 0x01, 'd,s,t'],
    ['div',    'R', OP.OP, 4, 0x01, 'd,s,t'], ['divu',   'R', OP.OP, 5, 0x01, 'd,s,t'],
    ['rem',    'R', OP.OP, 6, 0x01, 'd,s,t'], ['remu',   'R', OP.OP, 7, 0x01, 'd,s,t'],
    // ---- Immediate ----
    ['addi',  'I',  OP.OPIMM, 0, 0, 'd,s,i'], ['slti',  'I',  OP.OPIMM, 2, 0, 'd,s,i'],
    ['sltiu', 'I',  OP.OPIMM, 3, 0, 'd,s,i'], ['xori',  'I',  OP.OPIMM, 4, 0, 'd,s,i'],
    ['ori',   'I',  OP.OPIMM, 6, 0, 'd,s,i'], ['andi',  'I',  OP.OPIMM, 7, 0, 'd,s,i'],
    ['slli',  'IS', OP.OPIMM, 1, 0x00, 'd,s,h'], ['srli', 'IS', OP.OPIMM, 5, 0x00, 'd,s,h'],
    ['srai',  'IS', OP.OPIMM, 5, 0x20, 'd,s,h'],
    // ---- Loads / stores ----
    ['lb',  'I', OP.LOAD, 0, 0, 'd,m'], ['lh',  'I', OP.LOAD, 1, 0, 'd,m'], ['lw', 'I', OP.LOAD, 2, 0, 'd,m'],
    ['lbu', 'I', OP.LOAD, 4, 0, 'd,m'], ['lhu', 'I', OP.LOAD, 5, 0, 'd,m'],
    ['sb',  'S', OP.STORE, 0, 0, 't,M'], ['sh', 'S', OP.STORE, 1, 0, 't,M'], ['sw', 'S', OP.STORE, 2, 0, 't,M'],
    // ---- Control ----
    ['beq',  'B', OP.BRANCH, 0, 0, 's,t,L'], ['bne',  'B', OP.BRANCH, 1, 0, 's,t,L'],
    ['blt',  'B', OP.BRANCH, 4, 0, 's,t,L'], ['bge',  'B', OP.BRANCH, 5, 0, 's,t,L'],
    ['bltu', 'B', OP.BRANCH, 6, 0, 's,t,L'], ['bgeu', 'B', OP.BRANCH, 7, 0, 's,t,L'],
    ['jal',  'J', OP.JAL, 0, 0, 'd,J'],
    ['jalr', 'I', OP.JALR, 0, 0, 'd,m'],
    // ---- Upper immediates ----
    ['lui',   'U', OP.LUI, 0, 0, 'd,u'], ['auipc', 'U', OP.AUIPC, 0, 0, 'd,u'],
    // ---- System ----
    ['ecall',  'SYS', OP.SYSTEM, 0, 0, ''], ['ebreak', 'SYS', OP.SYSTEM, 0, 1, ''],
    ['fence',  'SYS', OP.FENCE, 0, 0, ''],
];

export const BY_NAME: Record<string, InstrEntry> = {};
const BY_KEY: Record<string, InstrEntry> = {};

const keyOf = (opcode: number, funct3: number, funct7: number, format: Format): string => {
    switch (format) {
        case 'R': case 'IS': return `${opcode}.${funct3}.${funct7}`;
        case 'U': case 'J': return `${opcode}`;
        case 'SYS': return opcode === OP.SYSTEM ? `${opcode}.${funct7}` : `${opcode}`;
        default: return `${opcode}.${funct3}`;
    }
};

TABLE.forEach(([name, format, opcode, funct3, funct7, ops]) => {
    let base = opcode;
    if (format === 'SYS') base = opcode === OP.FENCE ? 0x0ff0000f : (funct7 << 20) | opcode;
    else if (format !== 'U' && format !== 'J') base |= funct3 << 12;
    if (format === 'R' || format === 'IS') base |= funct7 << 25;
    const entry: InstrEntry = {
        name, format, opcode, funct3, funct7,
        ops: (ops ? ops.split(',') : []) as OperandSpec[],
        base: base >>> 0,
    };
    BY_NAME[name] = entry;
    BY_KEY[keyOf(opcode, funct3, funct7, format)] = entry;
});

// ================== //
//  Immediates        //
// ================== //
export const immI = (v: number) => ((v & 0xfff) << 20) >>> 0;
export const immS = (v: number) => ((((v >> 5) & 0x7f) << 25) | ((v & 0x1f) << 7)) >>> 0;
export const immB = (v: number) => ((((v >> 12) & 1) << 31) | (((v >> 5) & 0x3f) << 25) | (((v >> 1) & 0xf) << 8) | (((v >> 11) & 1) << 7)) >>> 0;
export const immU = (v: number) => ((v & 0xfffff) << 12) >>> 0;
export const immJ = (v: number) => ((((v >> 20) & 1) << 31) | (((v >> 1) & 0x3ff) << 21) | (((v >> 11) & 1) << 20) | (((v >> 12) & 0xff) << 12)) >>> 0;

// ================== //
//  Decoder           //
// ================== //
export interface Fields {
    word: number;
    opcode: number; rd: number; rs1: number; rs2: number; funct3: number; funct7: number;
    immI: number; immS: number; immB: number; immU: number; immJ: number;
    entry: InstrEntry | null;
}

export const decode = (word: number): Fields => {
    word >>>= 0;
    const opcode = word & 0x7f;
    const funct3 = (word >>> 12) & 7;
    const funct7 = word >>> 25;
    const f: Fields = {
        word, opcode, funct3, funct7,
        rd: (word >>> 7) & 31,
        rs1: (word >>> 15) & 31,
        rs2: (word >>> 20) & 31,
        immI: word >> 20,
        immS: ((word >> 25) << 5) | ((word >>> 7) & 0x1f),
        immB: ((word >> 31) << 12) | (((word >>> 7) & 1) << 11) | (((word >>> 25) & 0x3f) << 5) | (((word >>> 8) & 0xf) << 1),
        immU: (word & 0xfffff000) | 0,
        immJ: ((word >> 31) << 20) | (((word >>> 12) & 0xff) << 12) | (((word >>> 20) & 1) << 11) | (((word >>> 21) & 0x3ff) << 1),
        entry: null,
    };
    let key: string;
    switch (opcode) {
        case OP.OP: key = `${opcode}.${funct3}.${funct7}`; break;
        case OP.OPIMM: key = (funct3 === 1 || funct3 === 5) ? `${opcode}.${funct3}.${funct7}` : `${opcode}.${funct3}`; break;
        case OP.LUI: case OP.AUIPC: case OP.JAL: case OP.FENCE: key = `${opcode}`; break;
        case OP.SYSTEM: key = word === 0x73 ? `${opcode}.0` : word === 0x100073 ? `${opcode}.1` : '-'; break;
        default: key = `${opcode}.${funct3}`;
    }
    f.entry = BY_KEY[key] || null;
    return f;
};

export const hex = (n: number, pad = 8): string => '0x' + (n >>> 0).toString(16).padStart(pad, '0');

/**
 * @desc: Disassembles a machine word (register numbers, like RARS "basic")
*/
export const disassemble = (word: number, pc = 0): string => {
    if ((word >>> 0) === 0x00000013) return 'nop';
    const f = decode(word);
    const e = f.entry;
    if (!e) return `.word ${hex(word)}`;
    const parts = e.ops.map((op): string => {
        switch (op) {
            case 'd': return `x${f.rd}`;
            case 's': return `x${f.rs1}`;
            case 't': return `x${f.rs2}`;
            case 'i': return `${f.immI}`;
            case 'h': return `${f.rs2}`;
            case 'm': return `${f.immI}(x${f.rs1})`;
            case 'M': return `${f.immS}(x${f.rs1})`;
            case 'L': return hex(pc + f.immB);
            case 'J': return hex(pc + f.immJ);
            case 'u': return hex(f.immU >>> 12, 5);
        }
    });
    return parts.length ? `${e.name} ${parts.join(', ')}` : e.name;
};

// ================== //
//  Dependencies      //
// ================== //
export const deps = (word: number): Deps => {
    const f = decode(word);
    const e = f.entry;
    const d: Deps = { reads: [], writes: [], kind: 'alu' };
    if ((word >>> 0) === 0x13) { d.kind = 'nop'; return d; }
    if (!e) { d.kind = 'other'; return d; }
    const { rd, rs1, rs2 } = f;
    switch (e.format) {
        case 'R': d.reads = [rs1, rs2]; d.writes = [rd]; if (e.funct7 === 1) d.kind = 'mul'; break;
        case 'IS': d.reads = [rs1]; d.writes = [rd]; break;
        case 'I':
            d.reads = [rs1]; d.writes = [rd];
            if (e.opcode === OP.LOAD) {
                d.kind = 'load';
                d.mem = { base: rs1, offset: f.immI, size: [1, 2, 4, 0, 1, 2][e.funct3] };
            }
            if (e.opcode === OP.JALR) d.kind = 'jumpr';
            break;
        case 'S':
            d.reads = [rs1, rs2]; d.storeData = [rs2]; d.kind = 'store';
            d.mem = { base: rs1, offset: f.immS, size: [1, 2, 4][e.funct3] };
            break;
        case 'B': d.reads = [rs1, rs2]; d.kind = 'branch'; break;
        case 'U': d.writes = [rd]; break;
        case 'J': d.writes = [rd]; d.kind = 'jump'; break;
        case 'SYS':
            if (e.name === 'ecall') { d.reads = [17, 10, 11, 12]; d.writes = [10]; d.kind = 'syscall'; }
            else d.kind = 'other';
            break;
    }
    d.reads = d.reads.filter(r => r !== 0);
    d.writes = d.writes.filter(r => r !== 0);
    if (d.storeData) d.storeData = d.storeData.filter(r => r !== 0);
    return d;
};
