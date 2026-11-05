/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/riscv/cpu.ts

    RV32IM CPU: 32 registers (x0 = 0), pc, RARS syscalls (number in a7,
    arguments a0-a2, result in a0). No integer overflow traps; division by
    zero follows the specification (quotient -1, remainder = dividend).

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { decode } from './isa';
import { Machine, MachineException, ExecResult, ExcKind, Snapshot, SyscallABI, hex } from '../core/machine';

// mcause codes
const CAUSE: Record<ExcKind, [number, string]> = {
    fetch:    [1, 'Instruction access fault'],
    illegal:  [2, 'Illegal instruction'],
    break:    [3, 'Breakpoint'],
    load:     [5, 'Load access fault'],
    store:    [7, 'Store access fault'],
    syscall:  [8, 'Environment call'],
    overflow: [2, 'Illegal instruction'],
    trap:     [2, 'Illegal instruction'],
};

export class RiscvCPU extends Machine {

    readonly arch = 'riscv' as const;
    protected readonly SP = 2;
    protected readonly GP = 3;
    protected readonly ABI: SyscallABI = { code: 17, a0: 10, a1: 11, a2: 12, ret: 10 };

    constructor(...args: ConstructorParameters<typeof Machine>) {
        super(...args);
        this.reset();
    }

    protected resetArch(): void { /* Only integer registers */ }

    protected cause(kind: ExcKind): [number, string] { return CAUSE[kind]; }

    protected trap(): boolean { return false; }

    protected exec(word: number, pc: number, next: number): ExecResult {
        const f = decode(word);
        const r = this.r;
        const { rd, rs1, rs2, funct3, funct7 } = f;
        const a = r[rs1], b = r[rs2];

        switch (f.opcode) {
            // ---- lui / auipc ----
            case 0x37: this.setReg(rd, f.immU); return;
            case 0x17: this.setReg(rd, (pc + f.immU) | 0); return;

            // ---- jal / jalr ----
            case 0x6f: this.setReg(rd, next); return (pc + f.immJ) >>> 0;
            case 0x67: {
                if (funct3 !== 0) break;
                const target = ((a + f.immI) & ~1) >>> 0;
                this.setReg(rd, next);
                return target;
            }

            // ---- Branches ----
            case 0x63: {
                let take: boolean;
                switch (funct3) {
                    case 0: take = a === b; break;
                    case 1: take = a !== b; break;
                    case 4: take = a < b; break;
                    case 5: take = a >= b; break;
                    case 6: take = (a >>> 0) < (b >>> 0); break;
                    case 7: take = (a >>> 0) >= (b >>> 0); break;
                    default: throw this.illegal(word);
                }
                return take ? (pc + f.immB) >>> 0 : undefined;
            }

            // ---- Loads ----
            case 0x03: {
                const addr = (a + f.immI) >>> 0;
                switch (funct3) {
                    case 0: this.setReg(rd, (this.load8(addr) << 24) >> 24); return;
                    case 1: this.setReg(rd, (this.load16(addr) << 16) >> 16); return;
                    case 2: this.setReg(rd, this.load32(addr) | 0); return;
                    case 4: this.setReg(rd, this.load8(addr)); return;
                    case 5: this.setReg(rd, this.load16(addr)); return;
                }
                break;
            }

            // ---- Stores ----
            case 0x23: {
                const addr = (a + f.immS) >>> 0;
                switch (funct3) {
                    case 0: this.store8(addr, b); return;
                    case 1: this.store16(addr, b); return;
                    case 2: this.store32(addr, b); return;
                }
                break;
            }

            // ---- ALU immediate ----
            case 0x13: {
                const imm = f.immI, sh = rs2;
                switch (funct3) {
                    case 0: this.setReg(rd, (a + imm) | 0); return;
                    case 2: this.setReg(rd, a < imm ? 1 : 0); return;
                    case 3: this.setReg(rd, (a >>> 0) < (imm >>> 0) ? 1 : 0); return;
                    case 4: this.setReg(rd, a ^ imm); return;
                    case 6: this.setReg(rd, a | imm); return;
                    case 7: this.setReg(rd, a & imm); return;
                    case 1: if (funct7 === 0) { this.setReg(rd, a << sh); return; } break;
                    case 5:
                        if (funct7 === 0) { this.setReg(rd, a >>> sh); return; }
                        if (funct7 === 0x20) { this.setReg(rd, a >> sh); return; }
                        break;
                }
                break;
            }

            // ---- ALU register ----
            case 0x33: {
                if (funct7 === 0x01) { this.setReg(rd, this.muldiv(funct3, a, b)); return; }
                const sh = b & 31;
                switch ((funct7 << 3) | funct3) {
                    case 0x000: this.setReg(rd, (a + b) | 0); return;
                    case 0x100: this.setReg(rd, (a - b) | 0); return;
                    case 0x001: this.setReg(rd, a << sh); return;
                    case 0x002: this.setReg(rd, a < b ? 1 : 0); return;
                    case 0x003: this.setReg(rd, (a >>> 0) < (b >>> 0) ? 1 : 0); return;
                    case 0x004: this.setReg(rd, a ^ b); return;
                    case 0x005: this.setReg(rd, a >>> sh); return;
                    case 0x105: this.setReg(rd, a >> sh); return;
                    case 0x006: this.setReg(rd, a | b); return;
                    case 0x007: this.setReg(rd, a & b); return;
                }
                break;
            }

            // ---- fence (no effect) / system ----
            case 0x0f: return;
            case 0x73:
                if (word === 0x00000073) return this.syscall();
                if (word === 0x00100073) throw new MachineException('break', 'ebreak');
                break;
        }
        throw this.illegal(word);
    }

    private illegal(word: number): MachineException {
        return new MachineException('illegal', `illegal instruction ${hex(word)}`);
    }

    /**
     * @desc: RV32M (mul, mulh, mulhsu, mulhu, div, divu, rem, remu)
    */
    private muldiv(funct3: number, a: number, b: number): number {
        const hi = (p: bigint) => Number(BigInt.asIntN(32, p >> 32n));
        switch (funct3) {
            case 0: return Math.imul(a, b);
            case 1: return hi(BigInt(a) * BigInt(b));
            case 2: return hi(BigInt(a) * BigInt(b >>> 0));
            case 3: return hi(BigInt(a >>> 0) * BigInt(b >>> 0));
            case 4: if (b === 0) return -1; if (a === -0x80000000 && b === -1) return a; return (a / b) | 0;
            case 5: if (b === 0) return -1; return Math.floor((a >>> 0) / (b >>> 0)) | 0;
            case 6: if (b === 0) return a; if (a === -0x80000000 && b === -1) return 0; return (a % b) | 0;
            default: if (b === 0) return a; return ((a >>> 0) % (b >>> 0)) | 0;
        }
    }

    snapshot(): Snapshot {
        return {
            r: Array.from(this.r), f: [], hi: 0, lo: 0, pc: this.pc >>> 0,
            cp0: { badvaddr: 0, status: 0, cause: 0, epc: 0 }, fcc: [],
        };
    }
}
