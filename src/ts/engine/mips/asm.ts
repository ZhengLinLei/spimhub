/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/mips/asm.ts

    MIPS32 for the assembler: registers ($t0, $8, $f2), pseudo instructions
    (SPIM / MARS) and the encoder.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { GPR, COP0, BY_NAME, disassemble, hex } from './isa';
import {
    Arch, AsmError, Ctx, Real, Operand, RegOp, FregOp, ImmOp, MemOp,
    R, F, I, M, isReg, isFreg, isImm, isMem, want, resolve,
    fitsS16, fitsU16, hi16, lo16, hiAdj, loS,
} from '../core/asm';

const AT = 1, RA = 31, ZERO = 0;

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
//  Arch              //
// ================== //
export const MIPS: Arch = {
    name: 'mips',
    label: 'MIPS32',
    parseRegister,
    expand,
    encode,
    disassemble,
    hi: hiAdj,
    lo: loS,
    startup: [
        // SPIM like start up code: it calls main and exits when main returns
        'lw $a0, 0($sp)', 'addiu $a1, $sp, 4', 'addiu $a2, $a1, 4', 'sll $v0, $a0, 2',
        'addu $a2, $a2, $v0', 'jal main', 'nop', 'li $v0, 10', 'syscall',
    ],
};
