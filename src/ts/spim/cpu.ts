/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/ts/spim/cpu.ts

    MIPS32 CPU simulator. It executes real machine words fetched from memory
    (the output of the assembler), so what you see in the text segment is
    exactly what runs.

        - 32 general purpose registers, hi, lo, pc
        - Coprocessor 1 (FPU): 32 x 32 bits registers, 8 condition flags
        - Coprocessor 0: badvaddr, status, cause, epc (+ kernel handler at 0x80000180)
        - Little endian, sparse paged memory
        - SPIM / MARS compatible syscalls

    © 2026 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import { decode, hex, Fields } from './isa';
import type { Program } from './assembler';

// ================== //
//  Memory            //
// ================== //
const PAGE_BITS = 12, PAGE_SIZE = 1 << PAGE_BITS, PAGE_MASK = PAGE_SIZE - 1;

const decodeUTF8 = (bytes: number[]): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
    catch (e) { return String.fromCharCode(...bytes); }
};
const encodeUTF8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

export class Memory {
    pages = new Map<number, Uint8Array>();

    clear(): void { this.pages.clear(); }

    private page(addr: number, create: true): Uint8Array;
    private page(addr: number, create: false): Uint8Array | undefined;
    private page(addr: number, create: boolean): Uint8Array | undefined {
        const n = addr >>> PAGE_BITS;
        let p = this.pages.get(n);
        if (!p && create) { p = new Uint8Array(PAGE_SIZE); this.pages.set(n, p); }
        return p;
    }

    read8(addr: number): number {
        addr >>>= 0;
        const p = this.page(addr, false);
        return p ? p[addr & PAGE_MASK] : 0;
    }
    write8(addr: number, v: number): void {
        addr >>>= 0;
        this.page(addr, true)[addr & PAGE_MASK] = v & 0xff;
    }
    read16(addr: number): number { return this.read8(addr) | (this.read8(addr + 1) << 8); }
    write16(addr: number, v: number): void { this.write8(addr, v); this.write8(addr + 1, v >>> 8); }
    read32(addr: number): number {
        addr >>>= 0;
        const p = this.page(addr, false);
        const o = addr & PAGE_MASK;
        if (o <= PAGE_SIZE - 4) return p ? (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16) | (p[o + 3] << 24)) >>> 0 : 0;
        return (this.read16(addr) | (this.read16(addr + 2) << 16)) >>> 0;
    }
    write32(addr: number, v: number): void {
        addr >>>= 0;
        const p = this.page(addr, true);
        const o = addr & PAGE_MASK;
        if (o <= PAGE_SIZE - 4) {
            p[o] = v; p[o + 1] = v >>> 8; p[o + 2] = v >>> 16; p[o + 3] = v >>> 24;
        } else { this.write16(addr, v); this.write16(addr + 2, v >>> 16); }
    }
    writeBytes(addr: number, bytes: ArrayLike<number>): void {
        for (let i = 0; i < bytes.length; i++) this.write8(addr + i, bytes[i]);
    }

    /**
     * @desc: Reads a NUL terminated string (max `limit` bytes) decoded as UTF-8
    */
    readString(addr: number, limit = 1 << 16): string {
        const bytes: number[] = [];
        for (let i = 0; i < limit; i++) {
            const b = this.read8(addr + i);
            if (b === 0) break;
            bytes.push(b);
        }
        return decodeUTF8(bytes);
    }
}

// ================== //
//  Exceptions        //
// ================== //
const EXC = { INT: 0, ADEL: 4, ADES: 5, IBE: 6, DBE: 7, SYS: 8, BP: 9, RI: 10, CPU: 11, OV: 12, TR: 13, FPE: 15 } as const;
export const EXC_NAME: Record<number, string> = {
    0: 'Interrupt', 4: 'Address error in inst/data fetch', 5: 'Address error in store',
    6: 'Bad instruction address', 7: 'Bad data address', 8: 'Error in syscall', 9: 'Breakpoint',
    10: 'Reserved instruction', 11: 'Coprocessor unusable', 12: 'Arithmetic overflow', 13: 'Trap',
    15: 'Floating point',
};

class MipsException {
    constructor(public code: number, public message: string, public badvaddr?: number) {}
}

// ================== //
//  CPU               //
// ================== //
export const STATE = {
    IDLE: 'idle',           // Nothing loaded
    READY: 'ready',         // Loaded / paused, can step
    INPUT: 'input',         // Waiting for user input (syscall)
    EXITED: 'exited',       // Program finished
    ERROR: 'error',         // Unhandled exception / runtime error
} as const;
export type State = typeof STATE[keyof typeof STATE];
export type InputKind = 'int' | 'float' | 'double' | 'string' | 'char';

export interface IO {
    write?(text: string): void;                         // Prints program output
    readLine?(kind: InputKind): string | null;           // null when no input is available yet
}

export interface Snapshot {
    r: number[]; f: number[]; hi: number; lo: number; pc: number;
    cp0: CP0; fcc: number[];
}
interface CP0 { badvaddr: number; status: number; cause: number; epc: number; }

export const SP_INIT = 0x7fffeffc;
export const GP_INIT = 0x10008000;
const KTEXT = 0x80000180;

type ExecResult = number | undefined | 'wait';

export class CPU {

    static Memory = Memory;
    static STATE = STATE;
    static EXC_NAME = EXC_NAME;
    static SP_INIT = SP_INIT;
    static GP_INIT = GP_INIT;

    io: IO;
    mem = new Memory();
    r = new Int32Array(32);
    fbuf = new ArrayBuffer(128);
    fi = new Int32Array(this.fbuf);
    ff = new Float32Array(this.fbuf);
    fd = new Float64Array(this.fbuf);
    fcc = new Uint8Array(8);
    hi = 0;
    lo = 0;
    pc = 0;
    cp0: CP0 = { badvaddr: 0, status: 0x0000ff11, cause: 0, epc: 0 };
    program: Program | null = null;
    state: State = STATE.IDLE;
    steps = 0;
    exitCode = 0;
    error: string | null = null;
    inputKind: InputKind | null = null;
    heap = 0;
    rand: () => number = () => 0;
    private textRanges: [number, number][] = [];

    constructor(io: IO = {}) {
        this.io = io;
        this.reset();
    }

    /**
     * @desc: Resets registers and memory and loads the program again (if any)
    */
    reset(): void {
        this.r.fill(0);
        this.fi.fill(0);
        this.fcc.fill(0);
        this.hi = 0;
        this.lo = 0;
        this.pc = 0;
        this.cp0 = { badvaddr: 0, status: 0x0000ff11, cause: 0, epc: 0 };
        this.mem.clear();
        this.steps = 0;
        this.exitCode = 0;
        this.error = null;
        this.inputKind = null;
        this.rand = this.seed(Date.now());
        this.r[29] = SP_INIT;
        this.r[28] = GP_INIT;

        const p = this.program;
        if (!p) { this.state = STATE.IDLE; return; }

        p.text.forEach(t => this.mem.write32(t.addr, t.word));
        p.data.forEach(c => this.mem.writeBytes(c.addr, c.bytes));
        this.textRanges = [[p.textStart, p.textEnd]];
        if (p.hasKernelHandler) this.textRanges.push([KTEXT, p.ktextEnd]);
        this.heap = (p.dataEnd + 7) & ~7;
        this.pc = p.entry >>> 0;
        this.state = STATE.READY;
    }

    /**
     * @desc: Loads an assembled program and resets the machine
    */
    load(program: Program | null): void {
        this.program = program;
        this.reset();
    }

    // ---------------- Helpers ----------------
    private seed(s: number): () => number {
        let x = (s >>> 0) || 1;
        return () => {
            x ^= x << 13; x >>>= 0;
            x ^= x >>> 17;
            x ^= x << 5; x >>>= 0;
            return x;
        };
    }

    private inText(addr: number): boolean {
        return this.textRanges.some(([a, b]) => addr >= a && addr < b);
    }

    private checkAddr(addr: number, size: number, store: boolean): number {
        addr >>>= 0;
        const code = store ? EXC.ADES : EXC.ADEL;
        if (addr & (size - 1)) throw new MipsException(code, `unaligned address ${hex(addr)}`, addr);
        if (addr < 0x00400000) throw new MipsException(code, `bad address ${hex(addr)}`, addr);
        if (store && addr < 0x10000000) throw new MipsException(code, `cannot write to the text segment ${hex(addr)}`, addr);
        return addr;
    }

    load8(a: number): number  { return this.mem.read8(this.checkAddr(a, 1, false)); }
    load16(a: number): number { return this.mem.read16(this.checkAddr(a, 2, false)); }
    load32(a: number): number { return this.mem.read32(this.checkAddr(a, 4, false)); }
    store8(a: number, v: number): void  { this.mem.write8(this.checkAddr(a, 1, true), v); }
    store16(a: number, v: number): void { this.mem.write16(this.checkAddr(a, 2, true), v); }
    store32(a: number, v: number): void { this.mem.write32(this.checkAddr(a, 4, true), v); }

    setReg(n: number, v: number): void { if (n !== 0) this.r[n] = v; }

    getDouble(n: number): number {
        if (n & 1) throw new MipsException(EXC.RI, `double precision operation on odd register $f${n}`);
        return this.fd[n >> 1];
    }
    setDouble(n: number, v: number): void {
        if (n & 1) throw new MipsException(EXC.RI, `double precision operation on odd register $f${n}`);
        this.fd[n >> 1] = v;
    }

    private write(text: unknown): void { if (this.io.write) this.io.write(String(text)); }

    // ---------------- Execution ----------------
    /**
     * @desc: Executes one instruction
     * @return: {:State} - The new state
    */
    step(): State {
        if (this.state !== STATE.READY && this.state !== STATE.INPUT) return this.state;
        const pc = this.pc >>> 0;

        if (!this.inText(pc)) {
            this.fail(pc === this.program!.textEnd
                ? `attempt to execute non-instruction at ${hex(pc)} (did you forget to exit with syscall 10?)`
                : `attempt to execute non-instruction at ${hex(pc)}`);
            return this.state;
        }

        const word = this.mem.read32(pc);
        let next = (pc + 4) >>> 0;
        try {
            const res = this.exec(word, next);
            if (res === 'wait') return this.state;
            if (res !== undefined) next = res >>> 0;
            this.pc = next;
            this.steps++;
        } catch (e) {
            if (!(e instanceof MipsException)) throw e;
            this.exception(e, pc);
        }
        return this.state;
    }

    private fail(msg: string): void {
        this.error = msg;
        this.state = STATE.ERROR;
    }

    private exception(e: MipsException, pc: number): void {
        this.cp0.cause = (this.cp0.cause & ~0x7c) | (e.code << 2);
        this.cp0.epc = pc >>> 0;
        if (e.badvaddr !== undefined) this.cp0.badvaddr = e.badvaddr >>> 0;
        const msg = `Exception ${e.code} [${EXC_NAME[e.code] || 'Unknown'}] at ${hex(pc)}: ${e.message}`;

        if (this.program!.hasKernelHandler && !(this.cp0.status & 2)) {
            // Jump into the user provided exception handler (.ktext 0x80000180)
            this.cp0.status |= 2;   // EXL
            this.pc = KTEXT;
            this.steps++;
            return;
        }
        this.fail(msg);
    }

    /**
     * @desc: Executes a machine word. Returns the next pc, undefined (pc + 4) or 'wait'
    */
    private exec(word: number, next: number): ExecResult {
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
                    case 0x0d: throw new MipsException(EXC.BP, `break ${(word >>> 6) & 0xfffff}`);
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
                    case 0x34: if (r[rs] === r[rt]) throw new MipsException(EXC.TR, 'teq'); return;
                    case 0x36: if (r[rs] !== r[rt]) throw new MipsException(EXC.TR, 'tne'); return;
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
                if (rt & 1) throw new MipsException(EXC.RI, `ldc1 on odd register $f${rt}`);
                const a = this.checkAddr(r[rs] + simm, 8, false);
                this.fi[rt] = this.mem.read32(a); this.fi[rt + 1] = this.mem.read32(a + 4);
                return;
            }
            case 0x3d: {
                if (rt & 1) throw new MipsException(EXC.RI, `sdc1 on odd register $f${rt}`);
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

        throw new MipsException(EXC.RI, `reserved instruction ${hex(word)}`);
    }

    private addOv(a: number, b: number): number {
        const s = a + b;
        if (s > 0x7fffffff || s < -0x80000000) throw new MipsException(EXC.OV, 'arithmetic overflow');
        return s | 0;
    }

    private hilo(): bigint { return (BigInt(this.hi) << 32n) | BigInt(this.lo >>> 0); }

    private mul(p: bigint): undefined {
        this.lo = Number(BigInt.asIntN(32, p));
        this.hi = Number(BigInt.asIntN(32, p >> 32n));
        return undefined;
    }

    private unaligned(op: number, addr: number, rt: number): undefined {
        if (addr < 0x00400000) throw new MipsException(op >= 0x28 ? EXC.ADES : EXC.ADEL, `bad address ${hex(addr)}`, addr);
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
        throw new MipsException(EXC.RI, `reserved COP1 instruction ${hex(f.word)}`);
    }

    // ---------------- Syscalls ----------------
    /**
     * @desc: Reads a line from the io. Returns null (and waits) if not available.
    */
    private read(kind: InputKind): string | null {
        const line = this.io.readLine ? this.io.readLine(kind) : null;
        if (line === null || line === undefined) {
            this.state = STATE.INPUT;
            this.inputKind = kind;
            return null;
        }
        this.state = STATE.READY;
        this.inputKind = null;
        return String(line);
    }

    private syscall(): ExecResult {
        const r = this.r;
        const v0 = r[2], a0 = r[4], a1 = r[5];
        switch (v0) {
            case 1:  this.write(a0); return;
            case 2:  this.write(formatFloat(this.ff[12])); return;
            case 3:  this.write(formatDouble(this.getDouble(12))); return;
            case 4:  this.write(this.mem.readString(this.checkAddr(a0, 1, false))); return;
            case 5: {
                const s = this.read('int');
                if (s === null) return 'wait';
                const m = /^\s*([-+]?(?:0[xX][0-9a-fA-F]+|\d+))/.exec(s);
                r[2] = m ? Number(m[1]) | 0 : 0;
                return;
            }
            case 6: case 7: {
                const s = this.read(v0 === 6 ? 'float' : 'double');
                if (s === null) return 'wait';
                const v = parseFloat(s) || 0;
                if (v0 === 6) this.ff[0] = v; else this.setDouble(0, v);
                return;
            }
            case 8: {
                const s = this.read('string');
                if (s === null) return 'wait';
                const max = a1 | 0;
                if (max < 1) return;
                const bytes = encodeUTF8(s + '\n').slice(0, max - 1);
                bytes.forEach((b, i) => this.store8(a0 + i, b));
                this.store8(a0 + bytes.length, 0);
                return;
            }
            case 9: {
                const n = a0 | 0;
                r[2] = this.heap | 0;
                this.heap = (this.heap + ((n + 7) & ~7)) >>> 0;
                return;
            }
            case 10: this.state = STATE.EXITED; this.exitCode = 0; return;
            case 11: this.write(String.fromCharCode(a0 & 0xff)); return;
            case 12: {
                const s = this.read('char');
                if (s === null) return 'wait';
                r[2] = s.length ? s.charCodeAt(0) & 0xff : 10;
                return;
            }
            case 13: r[2] = -1; return;                               // open (no file system)
            case 14: {                                                // read (stdin only)
                if (a0 !== 0) { r[2] = -1; return; }
                const s = this.read('string');
                if (s === null) return 'wait';
                const bytes = encodeUTF8(s + '\n').slice(0, Math.max(0, r[6]));
                bytes.forEach((b, i) => this.store8(a1 + i, b));
                r[2] = bytes.length;
                return;
            }
            case 15: {                                                // write (stdout / stderr)
                if (a0 !== 1 && a0 !== 2) { r[2] = -1; return; }
                const n = Math.max(0, r[6]);
                const bytes: number[] = [];
                for (let i = 0; i < n; i++) bytes.push(this.load8(a1 + i));
                this.write(decodeUTF8(bytes));
                r[2] = n;
                return;
            }
            case 16: r[2] = 0; return;                                // close
            case 17: this.state = STATE.EXITED; this.exitCode = a0; return;
            case 30: {
                const t = BigInt(Date.now());
                r[4] = Number(BigInt.asIntN(32, t)); r[5] = Number(BigInt.asIntN(32, t >> 32n));
                return;
            }
            case 31: case 32: case 33: return;                        // MIDI / sleep (ignored)
            case 34: this.write(hex(a0)); return;
            case 35: this.write((a0 >>> 0).toString(2).padStart(32, '0')); return;
            case 36: this.write(a0 >>> 0); return;
            case 40: this.rand = this.seed(a1); return;
            case 41: r[4] = this.rand() | 0; return;
            case 42: r[4] = a1 > 0 ? this.rand() % a1 : 0; return;
            case 43: this.ff[0] = (this.rand() >>> 8) / (1 << 24); return;
            case 44: this.setDouble(0, this.rand() / 4294967296); return;
        }
        throw new MipsException(EXC.SYS, `unknown syscall ${v0}`);
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
