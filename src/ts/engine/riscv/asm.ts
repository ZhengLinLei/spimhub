/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/riscv/asm.ts

    RV32IM for the assembler: registers (x0-x31, ABI names), pseudo
    instructions (RARS / GNU as) and the encoder.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { XREG, BY_NAME, disassemble, hex, immI, immS, immB, immU, immJ } from './isa';
import {
    Arch, AsmError, Ctx, Real, Operand, RegOp,
    R, I, M, isReg, isImm, isMem, want, resolve,
} from '../core/asm';

const ZERO = 0, RA = 1;

const fitsS12 = (v: number) => v >= -2048 && v <= 2047;
// %hi / %lo for lui + addi (the low part is signed)
const hi20 = (v: number) => (((v >>> 0) + 0x800) >>> 12) & 0xfffff;
const lo12 = (v: number) => (v << 20) >> 20;

/**
 * @desc: Parses a register name (x5, t0, a0, fp...). Returns null if not a register.
*/
const parseRegister = (s: string): RegOp | null => {
    const name = s.trim().toLowerCase();
    if (name in XREG) return { t: 'reg', n: XREG[name] };
    if (/^x\d+$/.test(name)) throw new AsmError(`invalid register "${s}"`);
    if (name.startsWith('$')) throw new AsmError(`invalid register "${s}" (RISC-V registers have no "$": x5, t0, a0...)`);
    return null;
};

const LOADS = ['lb', 'lh', 'lw', 'lbu', 'lhu'];
const STORES = ['sb', 'sh', 'sw'];
// Branch pseudo instructions with swapped operands
const SWAPPED: Record<string, string> = { bgt: 'blt', ble: 'bge', bgtu: 'bltu', bleu: 'bgeu' };
// Compare with zero
const ZERO_BRANCH: Record<string, [string, boolean]> = {
    beqz: ['beq', false], bnez: ['bne', false], bltz: ['blt', false], bgez: ['bge', false],
    blez: ['bge', true],  bgtz: ['blt', true],
};

/**
 * @desc: Loads a 32 bits constant (1 or 2 instructions)
*/
const loadImm = (rd: number, op: Operand, ctx: Ctx): Real[] => {
    const v = ctx.val(op) | 0;
    const long = ctx.isLong(op, () => !(fitsS12(v) || lo12(v) === 0));
    if (!long) return fitsS12(v) ? [['addi', [R(rd), R(ZERO), I(v)]]] : [['lui', [R(rd), I(hi20(v))]]];
    return [['lui', [R(rd), I(hi20(v))]], ['addi', [R(rd), R(rd), I(lo12(v))]]];
};

/**
 * @desc: Expands a statement into real RV32IM instructions
*/
const expand = (mn: string, ops: Operand[], ctx: Ctx): Real[] => {
    const n = ops.length;
    const o = ops;

    // ---- Loads: lw rd, imm(rs1) | lw rd, label ----
    if (LOADS.includes(mn)) {
        want(n === 2 && isReg(o[0]), `"${mn}" expects rd, offset(rs1)`);
        if (isMem(o[1])) return [[mn, [o[0], o[1]]]];
        want(isImm(o[1]), `"${mn}" expects rd, offset(rs1)`);
        const v = ctx.val(o[1]) | 0;
        return [['lui', [o[0], I(hi20(v))]], [mn, [o[0], M(lo12(v), o[0].n)]]];
    }
    // ---- Stores: sw rs2, imm(rs1) | sw rs2, label, temp ----
    if (STORES.includes(mn)) {
        want((n === 2 || n === 3) && isReg(o[0]), `"${mn}" expects rs2, offset(rs1)`);
        if (n === 2 && isMem(o[1])) return [[mn, [o[0], o[1]]]];
        want(n === 3 && isImm(o[1]) && isReg(o[2]), `"${mn}" with a label needs a temporary register: ${mn} rs2, label, t0`);
        const v = ctx.val(o[1]) | 0;
        return [['lui', [o[2], I(hi20(v))]], [mn, [o[0], M(lo12(v), (o[2] as RegOp).n)]]];
    }

    if (mn in SWAPPED) {
        want(n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(o[2]), `"${mn}" expects rs1, rs2, label`);
        return [[SWAPPED[mn], [o[1], o[0], o[2]]]];
    }
    if (mn in ZERO_BRANCH) {
        want(n === 2 && isReg(o[0]) && isImm(o[1]), `"${mn}" expects rs, label`);
        const [real, swap] = ZERO_BRANCH[mn];
        return [[real, swap ? [R(ZERO), o[0], o[1]] : [o[0], R(ZERO), o[1]]]];
    }

    switch (mn) {
        case 'nop': return [['addi', [R(ZERO), R(ZERO), I(0)]]];
        case 'li':
            want(n === 2 && isReg(o[0]) && isImm(o[1]), '"li" expects rd, immediate');
            return loadImm(o[0].n, o[1], ctx);
        case 'la': {
            want(n === 2 && isReg(o[0]) && isImm(o[1]), '"la" expects rd, label');
            const v = ctx.val(o[1]) | 0;
            return [['lui', [o[0], I(hi20(v))]], ['addi', [o[0], o[0], I(lo12(v))]]];
        }
        case 'mv':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"mv" expects rd, rs');
            return [['addi', [o[0], o[1], I(0)]]];
        case 'not':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"not" expects rd, rs');
            return [['xori', [o[0], o[1], I(-1)]]];
        case 'neg':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"neg" expects rd, rs');
            return [['sub', [o[0], R(ZERO), o[1]]]];
        case 'seqz':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"seqz" expects rd, rs');
            return [['sltiu', [o[0], o[1], I(1)]]];
        case 'snez':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"snez" expects rd, rs');
            return [['sltu', [o[0], R(ZERO), o[1]]]];
        case 'sltz':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"sltz" expects rd, rs');
            return [['slt', [o[0], o[1], R(ZERO)]]];
        case 'sgtz':
            want(n === 2 && isReg(o[0]) && isReg(o[1]), '"sgtz" expects rd, rs');
            return [['slt', [o[0], R(ZERO), o[1]]]];
        case 'j':
            want(n === 1 && isImm(o[0]), '"j" expects a label');
            return [['jal', [R(ZERO), o[0]]]];
        case 'tail':
            want(n === 1 && isImm(o[0]), '"tail" expects a label');
            return [['jal', [R(ZERO), o[0]]]];
        case 'call':
            want(n === 1 && isImm(o[0]), '"call" expects a label');
            return [['jal', [R(RA), o[0]]]];
        case 'jal':
            if (n === 1) return [['jal', [R(RA), o[0]]]];
            break;
        case 'jr':
            want(n === 1 && isReg(o[0]), '"jr" expects a register');
            return [['jalr', [R(ZERO), M(0, o[0].n)]]];
        case 'ret':
            want(n === 0, '"ret" has no operands');
            return [['jalr', [R(ZERO), M(0, RA)]]];
        case 'jalr':
            if (n === 1 && isReg(o[0])) return [['jalr', [R(RA), M(0, o[0].n)]]];
            if (n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(o[2])) return [['jalr', [o[0], M(ctx.val(o[2]), o[1].n)]]];
            break;
        case 'subi':
            want(n === 3 && isReg(o[0]) && isReg(o[1]) && isImm(o[2]), '"subi" expects rd, rs, imm');
            return [['addi', [o[0], o[1], I(-ctx.val(o[2]))]]];
    }

    const entry = BY_NAME[mn];
    if (!entry) throw new AsmError(`unknown instruction "${mn}"`);
    // Friendly message for the MIPS habit "add rd, rs, imm"
    if (entry.format === 'R' && n === 3 && isImm(o[2]) && BY_NAME[mn + 'i']) {
        throw new AsmError(`"${mn}" needs 3 registers, use "${mn}i" for an immediate`);
    }
    return [[mn, o.map(op => resolve(op, ctx))]];
};

/**
 * @desc: Encodes a real RV32IM instruction
*/
const encode = (mn: string, ops: Operand[], pc: number): number => {
    const e = BY_NAME[mn];
    if (!e) throw new AsmError(`unknown instruction "${mn}"`);
    if (ops.length !== e.ops.length) {
        throw new AsmError(`"${mn}" expects ${e.ops.length} operand(s): ${e.ops.join(', ').replace(/[mM]/, 'offset(rs1)') || 'none'}`);
    }
    let w = e.base;
    const value = (op: Operand) => (op as { v: number }).v;

    e.ops.forEach((spec, i) => {
        const op = ops[i];
        const bad = (what: string) => new AsmError(`"${mn}" operand ${i + 1} must be ${what}`);
        switch (spec) {
            case 'd': if (!isReg(op)) throw bad('a register'); w |= op.n << 7; break;
            case 's': if (!isReg(op)) throw bad('a register'); w |= op.n << 15; break;
            case 't': if (!isReg(op)) throw bad('a register'); w |= op.n << 20; break;
            case 'i': {
                if (!isImm(op)) throw bad('an immediate');
                const v = value(op);
                if (!fitsS12(v)) throw new AsmError(`immediate ${v} out of range (-2048..2047), use li + ${mn.replace(/i$/, '')}`);
                w |= immI(v);
                break;
            }
            case 'h': {
                if (!isImm(op)) throw bad('a shift amount');
                const v = value(op);
                if (v < 0 || v > 31) throw new AsmError(`shift amount ${v} out of range (0..31)`);
                w |= v << 20;
                break;
            }
            case 'm': case 'M': {
                if (!isMem(op)) throw bad('a memory operand offset(rs1)');
                const v = value(op);
                if (!fitsS12(v)) throw new AsmError(`offset ${v} out of range (-2048..2047)`);
                w |= op.base << 15;
                w |= spec === 'm' ? immI(v) : immS(v);
                break;
            }
            case 'u': {
                if (!isImm(op)) throw bad('an immediate');
                const v = value(op);
                if (v < 0 || v > 0xfffff) throw new AsmError(`upper immediate ${v} out of range (0..0xfffff)`);
                w |= immU(v);
                break;
            }
            case 'L': case 'J': {
                if (!isImm(op)) throw bad('a label');
                const off = (value(op) >>> 0) - pc;
                if (off & 1) throw new AsmError(`target ${hex(value(op))} is not aligned`);
                const range = spec === 'L' ? 4096 : 1048576;
                if (off < -range || off >= range) throw new AsmError(`target ${hex(value(op))} out of range (±${spec === 'L' ? '4 KiB' : '1 MiB'})`);
                w |= spec === 'L' ? immB(off) : immJ(off);
                break;
            }
        }
    });
    return w >>> 0;
};

// ================== //
//  Arch              //
// ================== //
export const RISCV: Arch = {
    name: 'riscv',
    label: 'RV32IM',
    parseRegister,
    expand,
    encode,
    disassemble,
    hi: hi20,
    lo: lo12,
    startup: [
        // Calls main and exits when main returns (RARS exit: a7 = 10)
        'jal ra, main', 'li a7, 10', 'ecall',
    ],
};
