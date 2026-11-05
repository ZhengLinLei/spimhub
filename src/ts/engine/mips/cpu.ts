/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/mips/cpu.ts

    MIPS32 CPU. It executes the machine words of the text segment.

        - 32 general purpose registers, hi, lo, pc
        - Coprocessor 1 (FPU): 32 x 32 bits registers, 8 condition flags
        - Coprocessor 0: badvaddr, status, cause, epc (+ kernel handler at 0x80000180)
        - SPIM / MARS syscalls ($v0)

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { decode, Fields } from './isa';
import {
    Machine, MachineException, ExecResult, ExcKind, Snapshot, SyscallABI,
    STATE, SP_INIT, GP_INIT, KTEXT, hex,
} from '../core/machine';

export const EXC_NAME: Record<number, string> = {
    0: 'Interrupt', 4: 'Address error in inst/data fetch', 5: 'Address error in store',
    6: 'Bad instruction address', 7: 'Bad data address', 8: 'Error in syscall', 9: 'Breakpoint',
    10: 'Reserved instruction', 11: 'Coprocessor unusable', 12: 'Arithmetic overflow', 13: 'Trap',
    15: 'Floating point',
};
const EXC_CODE: Record<ExcKind, number> = {
    load: 4, fetch: 4, store: 5, syscall: 8, break: 9, illegal: 10, overflow: 12, trap: 13,
};

interface CP0 { badvaddr: number; status: number; cause: number; epc: number; }

export class MipsCPU extends Machine {

    static STATE = STATE;
    static EXC_NAME = EXC_NAME;
    static SP_INIT = SP_INIT;
    static GP_INIT = GP_INIT;

    readonly arch = 'mips' as const;
    protected readonly SP = 29;
    protected readonly GP = 28;
    protected readonly ABI: SyscallABI = { code: 2, a0: 4, a1: 5, a2: 6, ret: 2 };

    fbuf = new ArrayBuffer(128);
    fi = new Int32Array(this.fbuf);
    ff = new Float32Array(this.fbuf);
    fd = new Float64Array(this.fbuf);
    fcc = new Uint8Array(8);
    hi = 0;
    lo = 0;
    cp0: CP0 = { badvaddr: 0, status: 0x0000ff11, cause: 0, epc: 0 };

    constructor(...args: ConstructorParameters<typeof Machine>) {
        super(...args);
        this.reset();
    }

    protected resetArch(): void {
        this.fi.fill(0);
        this.fcc.fill(0);
        this.hi = 0;
        this.lo = 0;
        this.cp0 = { badvaddr: 0, status: 0x0000ff11, cause: 0, epc: 0 };
    }

    protected cause(kind: ExcKind): [number, string] {
        const code = EXC_CODE[kind];
        return [code, EXC_NAME[code]];
    }

    protected trap(code: number, e: MachineException, pc: number): boolean {
        this.cp0.cause = (this.cp0.cause & ~0x7c) | (code << 2);
        this.cp0.epc = pc >>> 0;
        if (e.badvaddr !== undefined) this.cp0.badvaddr = e.badvaddr >>> 0;
        if (this.program!.hasKernelHandler && !(this.cp0.status & 2)) {
            // Jump into the user provided exception handler (.ktext 0x80000180)
            this.cp0.status |= 2;   // EXL
            this.pc = KTEXT;
            return true;
        }
        return false;
    }

    getDouble(n: number): number {
        if (n & 1) throw new MachineException('illegal', `double precision operation on odd register $f${n}`);
        return this.fd[n >> 1];
    }
    setDouble(n: number, v: number): void {
        if (n & 1) throw new MachineException('illegal', `double precision operation on odd register $f${n}`);
        this.fd[n >> 1] = v;
    }

    /**
     * @desc: Executes a machine word. Returns the next pc, undefined (pc + 4) or 'wait'
    */
    protected exec(word: number, pc: number, next: number): ExecResult {
        const f = decode(word);
        const r = this.r;
        const { rs, rt, rd, sa, simm, imm } = f;
        const branch = (cond: boolean) => cond ? (next + (simm << 2)) >>> 0 : undefined;

        switch (f.op) {
            // ================ SPECIAL ================
            case 0x00:
                switch (f.fn) {
                    case 0x00: this.setReg(rd, r[rt] << sa); return;
                    case 0x02: this.setReg(rd, r[rt] >>> sa); return;
                    case 0x03: this.setReg(rd, r[rt] >> sa); return;
                    case 0x04: this.setReg(rd, r[rt] << (r[rs] & 31)); return;
                    case 0x06: this.setReg(rd, r[rt] >>> (r[rs] & 31)); return;
                    case 0x07: this.setReg(rd, r[rt] >> (r[rs] & 31)); return;
                    case 0x08: return r[rs] >>> 0;
                    case 0x09: { const t = r[rs] >>> 0; this.setReg(rd, next); return t; }
                    case 0x0a: if (r[rt] === 0) this.setReg(rd, r[rs]); return;
                    case 0x0b: if (r[rt] !== 0) this.setReg(rd, r[rs]); return;
                    case 0x0c: return this.syscall();
                    case 0x0d: throw new MachineException('break', `break ${(word >>> 6) & 0xfffff}`);
                    case 0x10: this.setReg(rd, this.hi); return;
                    case 0x11: this.hi = r[rs]; return;
                    case 0x12: this.setReg(rd, this.lo); return;
                    case 0x13: this.lo = r[rs]; return;
                    case 0x18: return this.mul(BigInt(r[rs]) * BigInt(r[rt]));
                    case 0x19: return this.mul(BigInt(r[rs] >>> 0) * BigInt(r[rt] >>> 0));
                    case 0x1a:
                        if (r[rt] !== 0) { this.lo = (r[rs] / r[rt]) | 0; this.hi = (r[rs] % r[rt]) | 0; }
                        return;
                    case 0x1b:
                        if (r[rt] !== 0) {
                            const a = r[rs] >>> 0, b = r[rt] >>> 0;
                            this.lo = Math.floor(a / b) | 0; this.hi = (a % b) | 0;
                        }
                        return;
                    case 0x20: this.setReg(rd, this.addOv(r[rs], r[rt])); return;
                    case 0x21: this.setReg(rd, (r[rs] + r[rt]) | 0); return;
                    case 0x22: this.setReg(rd, this.addOv(r[rs], -r[rt])); return;
                    case 0x23: this.setReg(rd, (r[rs] - r[rt]) | 0); return;
                    case 0x24: this.setReg(rd, r[rs] & r[rt]); return;
                    case 0x25: this.setReg(rd, r[rs] | r[rt]); return;
                    case 0x26: this.setReg(rd, r[rs] ^ r[rt]); return;
                    case 0x27: this.setReg(rd, ~(r[rs] | r[rt])); return;
                    case 0x2a: this.setReg(rd, r[rs] < r[rt] ? 1 : 0); return;
                    case 0x2b: this.setReg(rd, (r[rs] >>> 0) < (r[rt] >>> 0) ? 1 : 0); return;
                    case 0x34: if (r[rs] === r[rt]) throw new MachineException('trap', 'teq'); return;
                    case 0x36: if (r[rs] !== r[rt]) throw new MachineException('trap', 'tne'); return;
                }
                break;

            // ================ REGIMM ================
            case 0x01:
                switch (rt) {
                    case 0x00: return branch(r[rs] < 0);
                    case 0x01: return branch(r[rs] >= 0);
                    case 0x10: { const c = r[rs] < 0; this.setReg(31, next); return branch(c); }
                    case 0x11: { const c = r[rs] >= 0; this.setReg(31, next); return branch(c); }
                }
                break;

            // ================ J / I ================
            case 0x02: return ((next & 0xf0000000) | (f.target << 2)) >>> 0;
            case 0x03: this.setReg(31, next); return ((next & 0xf0000000) | (f.target << 2)) >>> 0;
            case 0x04: return branch(r[rs] === r[rt]);
            case 0x05: return branch(r[rs] !== r[rt]);
            case 0x06: return branch(r[rs] <= 0);
            case 0x07: return branch(r[rs] > 0);
            case 0x08: this.setReg(rt, this.addOv(r[rs], simm)); return;
            case 0x09: this.setReg(rt, (r[rs] + simm) | 0); return;
            case 0x0a: this.setReg(rt, r[rs] < simm ? 1 : 0); return;
            case 0x0b: this.setReg(rt, (r[rs] >>> 0) < (simm >>> 0) ? 1 : 0); return;
            case 0x0c: this.setReg(rt, r[rs] & imm); return;
            case 0x0d: this.setReg(rt, r[rs] | imm); return;
            case 0x0e: this.setReg(rt, r[rs] ^ imm); return;
            case 0x0f: this.setReg(rt, imm << 16); return;

            // ================ Loads / stores ================
            case 0x20: this.setReg(rt, (this.load8(r[rs] + simm) << 24) >> 24); return;
            case 0x21: this.setReg(rt, (this.load16(r[rs] + simm) << 16) >> 16); return;
            case 0x23: case 0x30: this.setReg(rt, this.load32(r[rs] + simm) | 0); return;
            case 0x24: this.setReg(rt, this.load8(r[rs] + simm)); return;
            case 0x25: this.setReg(rt, this.load16(r[rs] + simm)); return;
            case 0x28: this.store8(r[rs] + simm, r[rt]); return;
            case 0x29: this.store16(r[rs] + simm, r[rt]); return;
            case 0x2b: this.store32(r[rs] + simm, r[rt]); return;
            case 0x38: this.store32(r[rs] + simm, r[rt]); this.setReg(rt, 1); return;
            case 0x22: case 0x26: case 0x2a: case 0x2e: return this.unaligned(f.op, (r[rs] + simm) >>> 0, rt);
            case 0x31: this.fi[rt] = this.load32(r[rs] + simm); return;
            case 0x39: this.store32(r[rs] + simm, this.fi[rt]); return;
            case 0x35: {
                if (rt & 1) throw new MachineException('illegal', `ldc1 on odd register $f${rt}`);
                const a = this.checkAddr(r[rs] + simm, 8, false);
                this.fi[rt] = this.mem.read32(a); this.fi[rt + 1] = this.mem.read32(a + 4);
                return;
            }
            case 0x3d: {
                if (rt & 1) throw new MachineException('illegal', `sdc1 on odd register $f${rt}`);
                const a = this.checkAddr(r[rs] + simm, 8, true);
                this.mem.write32(a, this.fi[rt]); this.mem.write32(a + 4, this.fi[rt + 1]);
                return;
            }

            // ================ SPECIAL2 ================
            case 0x1c:
                switch (f.fn) {
                    case 0x00: return this.mul(this.hilo() + BigInt(r[rs]) * BigInt(r[rt]));
                    case 0x01: return this.mul(this.hilo() + BigInt(r[rs] >>> 0) * BigInt(r[rt] >>> 0));
                    case 0x02: this.setReg(rd, Math.imul(r[rs], r[rt])); return;
                    case 0x04: return this.mul(this.hilo() - BigInt(r[rs]) * BigInt(r[rt]));
                    case 0x05: return this.mul(this.hilo() - BigInt(r[rs] >>> 0) * BigInt(r[rt] >>> 0));
                    case 0x20: this.setReg(rd, Math.clz32(r[rs])); return;
                    case 0x21: this.setReg(rd, Math.clz32(~r[rs])); return;
                }
                break;

            // ================ COP0 ================
            case 0x10: {
                if (word === 0x42000018) {  // eret
                    this.cp0.status &= ~2;
                    return this.cp0.epc >>> 0;
                }
                const name = ({ 8: 'badvaddr', 12: 'status', 13: 'cause', 14: 'epc' } as Record<number, keyof CP0>)[rd];
                if (rs === 0) { this.setReg(rt, name ? this.cp0[name] | 0 : 0); return; }
                if (rs === 4) { if (name) this.cp0[name] = r[rt] >>> 0; return; }
                break;
            }

            // ================ COP1 ================
            case 0x11: return this.cop1(f, next);
        }

        throw new MachineException('illegal', `reserved instruction ${hex(word)}`);
    }

    private addOv(a: number, b: number): number {
        const s = a + b;
        if (s > 0x7fffffff || s < -0x80000000) throw new MachineException('overflow', 'arithmetic overflow');
        return s | 0;
    }

    private hilo(): bigint { return (BigInt(this.hi) << 32n) | BigInt(this.lo >>> 0); }

    private mul(p: bigint): undefined {
        this.lo = Number(BigInt.asIntN(32, p));
        this.hi = Number(BigInt.asIntN(32, p >> 32n));
        return undefined;
    }

    private unaligned(op: number, addr: number, rt: number): undefined {
        if (addr < 0x00400000) throw new MachineException(op >= 0x28 ? 'store' : 'load', `bad address ${hex(addr)}`, addr);
        const k = addr & 3, base = addr & ~3;
        const bytes = [0, 1, 2, 3].map(i => this.mem.read8(base + i));
        const reg = [0, 1, 2, 3].map(i => (this.r[rt] >>> (8 * i)) & 0xff);
        switch (op) {
            case 0x22: for (let i = 0; i <= k; i++) reg[3 - k + i] = bytes[i]; break;                   // lwl
            case 0x26: for (let i = k; i < 4; i++) reg[i - k] = bytes[i]; break;                        // lwr
            case 0x2a: for (let i = 0; i <= k; i++) this.store8(base + i, reg[3 - k + i]); return;       // swl
            case 0x2e: for (let i = k; i < 4; i++) this.store8(base + i, reg[i - k]); return;            // swr
        }
        this.setReg(rt, reg[0] | (reg[1] << 8) | (reg[2] << 16) | (reg[3] << 24));
        return undefined;
    }

    private cop1(f: Fields, next: number): ExecResult {
        const { fmt, ft, fs, fd, fn } = f;
        const ff = this.ff, fi = this.fi;

        if (fmt === 8) {   // bc1f / bc1t
            const cc = (ft >> 2) & 7;
            const cond = (ft & 1) ? this.fcc[cc] === 1 : this.fcc[cc] === 0;
            return cond ? (next + (f.simm << 2)) >>> 0 : undefined;
        }
        if (fmt === 0) { this.setReg(ft, fi[fs]); return; }   // mfc1
        if (fmt === 4) { fi[fs] = this.r[ft]; return; }        // mtc1

        const S = fmt === 16, D = fmt === 17, W = fmt === 20;
        const get = (n: number) => S ? ff[n] : D ? this.getDouble(n) : fi[n];
        const put = (n: number, v: number) => { if (S) ff[n] = v; else this.setDouble(n, v); };
        const toWord = (v: number) => {
            if (!isFinite(v) || v >= 2147483648 || v < -2147483648) return 0x7fffffff;
            return v | 0;
        };

        if (S || D) {
            switch (fn) {
                case 0x00: put(fd, get(fs) + get(ft)); return;
                case 0x01: put(fd, get(fs) - get(ft)); return;
                case 0x02: put(fd, get(fs) * get(ft)); return;
                case 0x03: put(fd, get(fs) / get(ft)); return;
                case 0x04: put(fd, Math.sqrt(get(fs))); return;
                case 0x05: put(fd, Math.abs(get(fs))); return;
                case 0x06:
                    if (S) fi[fd] = fi[fs];
                    else { this.getDouble(fs); this.getDouble(fd); fi[fd] = fi[fs]; fi[fd + 1] = fi[fs + 1]; }
                    return;
                case 0x07: put(fd, -get(fs)); return;
                case 0x0c: fi[fd] = toWord(roundEven(get(fs))); return;
                case 0x0d: fi[fd] = toWord(Math.trunc(get(fs))); return;
                case 0x0e: fi[fd] = toWord(Math.ceil(get(fs))); return;
                case 0x0f: fi[fd] = toWord(Math.floor(get(fs))); return;
                case 0x20: if (D) { ff[fd] = get(fs); return; } break;            // cvt.s.d
                case 0x21: if (S) { this.setDouble(fd, get(fs)); return; } break;  // cvt.d.s
                case 0x24: fi[fd] = toWord(Math.trunc(get(fs))); return;          // cvt.w.fmt
                case 0x32: this.fcc[(fd >> 2) & 7] = get(fs) === get(ft) ? 1 : 0; return;
                case 0x3c: this.fcc[(fd >> 2) & 7] = get(fs) < get(ft) ? 1 : 0; return;
                case 0x3e: this.fcc[(fd >> 2) & 7] = get(fs) <= get(ft) ? 1 : 0; return;
            }
        }
        if (W) {
            switch (fn) {
                case 0x20: ff[fd] = fi[fs]; return;                     // cvt.s.w
                case 0x21: this.setDouble(fd, fi[fs]); return;          // cvt.d.w
            }
        }
        throw new MachineException('illegal', `reserved COP1 instruction ${hex(f.word)}`);
    }

    // ---------------- Syscalls ----------------
    protected floatSyscall(code: number): ExecResult | false {
        switch (code) {
            case 2: this.write(formatFloat(this.ff[12])); return;
            case 3: this.write(formatDouble(this.getDouble(12))); return;
            case 6: case 7: {
                const s = this.read(code === 6 ? 'float' : 'double');
                if (s === null) return 'wait';
                const v = parseFloat(s) || 0;
                if (code === 6) this.ff[0] = v; else this.setDouble(0, v);
                return;
            }
        }
        return false;
    }

    protected syscall(): ExecResult {
        switch (this.r[2]) {
            case 43: this.ff[0] = (this.rand() >>> 8) / (1 << 24); return;
            case 44: this.setDouble(0, this.rand() / 4294967296); return;
        }
        return super.syscall();
    }

    /**
     * @desc: Snapshot used by the GUI to highlight changes
    */
    snapshot(): Snapshot {
        return {
            r: Array.from(this.r),
            f: Array.from(this.fi),
            hi: this.hi, lo: this.lo, pc: this.pc >>> 0,
            cp0: { ...this.cp0 },
            fcc: Array.from(this.fcc),
        };
    }
}

const roundEven = (v: number): number => {
    const r = Math.round(v);
    return (Math.abs(v % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
};
const formatFloat = (v: number) => isFinite(v) ? v.toFixed(8) : (isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf');
const formatDouble = (v: number) => isFinite(v) ? v.toFixed(16) : (isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf');
