/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/core/machine.ts

    What every simulated CPU shares: sparse little endian memory, the
    execution states, address checks, exceptions and the syscalls (SPIM /
    MARS / RARS numbers). The instruction set lives in mips/cpu.ts and
    riscv/cpu.ts.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import type { ArchName, Program } from './asm';

export const hex = (n: number, pad = 8): string => '0x' + (n >>> 0).toString(16).padStart(pad, '0');

// ================== //
//  Memory            //
// ================== //
const PAGE_BITS = 12, PAGE_SIZE = 1 << PAGE_BITS, PAGE_MASK = PAGE_SIZE - 1;

export const decodeUTF8 = (bytes: number[]): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
    catch (e) { return String.fromCharCode(...bytes); }
};
export const encodeUTF8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

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
//  States            //
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
    cp0: { badvaddr: number; status: number; cause: number; epc: number };
    fcc: number[];
}

// ================== //
//  Exceptions        //
// ================== //
// Architecture independent kinds, every CPU maps them to its own cause codes
export type ExcKind = 'load' | 'store' | 'fetch' | 'overflow' | 'break' | 'illegal' | 'syscall' | 'trap';

export class MachineException {
    constructor(public kind: ExcKind, public message: string, public badvaddr?: number) {}
}

export const SP_INIT = 0x7fffeffc;
export const GP_INIT = 0x10008000;
export const KTEXT = 0x80000180;

/** Next pc, undefined (pc + 4) or 'wait' (blocked in an input syscall) */
export type ExecResult = number | undefined | 'wait';

/** Registers used by the syscalls of an architecture */
export interface SyscallABI {
    code: number;           // $v0 | a7
    a0: number; a1: number; a2: number;
    ret: number;            // $v0 | a0
}

export abstract class Machine {

    abstract readonly arch: ArchName;
    protected abstract readonly SP: number;     // Stack pointer register
    protected abstract readonly GP: number;     // Global pointer register
    protected abstract readonly ABI: SyscallABI;

    io: IO;
    mem = new Memory();
    r = new Int32Array(32);
    pc = 0;
    program: Program | null = null;
    state: State = STATE.IDLE;
    steps = 0;
    exitCode = 0;
    error: string | null = null;
    inputKind: InputKind | null = null;
    heap = 0;
    rand: () => number = () => 0;
    protected textRanges: [number, number][] = [];

    constructor(io: IO = {}) {
        this.io = io;
    }

    /** Architecture registers (FPU, hi / lo, CSRs...) */
    protected abstract resetArch(): void;
    /** Executes a machine word */
    protected abstract exec(word: number, pc: number, next: number): ExecResult;
    /** Cause code + name of an exception */
    protected abstract cause(kind: ExcKind): [number, string];
    /** Handles an exception (kernel handler). Returns false to stop the program */
    protected abstract trap(code: number, e: MachineException, pc: number): boolean;
    abstract snapshot(): Snapshot;

    /**
     * @desc: Resets registers and memory and loads the program again (if any)
    */
    reset(): void {
        this.r.fill(0);
        this.pc = 0;
        this.mem.clear();
        this.steps = 0;
        this.exitCode = 0;
        this.error = null;
        this.inputKind = null;
        this.rand = seed(Date.now());
        this.resetArch();
        this.r[this.SP] = SP_INIT;
        this.r[this.GP] = GP_INIT;

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

    // ---------------- Memory access ----------------
    protected checkAddr(addr: number, size: number, store: boolean): number {
        addr >>>= 0;
        const kind = store ? 'store' : 'load';
        if (addr & (size - 1)) throw new MachineException(kind, `unaligned address ${hex(addr)}`, addr);
        if (addr < 0x00400000) throw new MachineException(kind, `bad address ${hex(addr)}`, addr);
        if (store && addr < 0x10000000) throw new MachineException(kind, `cannot write to the text segment ${hex(addr)}`, addr);
        return addr;
    }

    load8(a: number): number  { return this.mem.read8(this.checkAddr(a, 1, false)); }
    load16(a: number): number { return this.mem.read16(this.checkAddr(a, 2, false)); }
    load32(a: number): number { return this.mem.read32(this.checkAddr(a, 4, false)); }
    store8(a: number, v: number): void  { this.mem.write8(this.checkAddr(a, 1, true), v); }
    store16(a: number, v: number): void { this.mem.write16(this.checkAddr(a, 2, true), v); }
    store32(a: number, v: number): void { this.mem.write32(this.checkAddr(a, 4, true), v); }

    setReg(n: number, v: number): void { if (n !== 0) this.r[n] = v; }

    protected write(text: unknown): void { if (this.io.write) this.io.write(String(text)); }

    // ---------------- Execution ----------------
    private inText(addr: number): boolean {
        return this.textRanges.some(([a, b]) => addr >= a && addr < b);
    }

    /**
     * @desc: Executes one instruction
     * @return: {:State} - The new state
    */
    step(): State {
        if (this.state !== STATE.READY && this.state !== STATE.INPUT) return this.state;
        const pc = this.pc >>> 0;

        if (!this.inText(pc)) {
            this.fail(pc === this.program!.textEnd
                ? `attempt to execute non-instruction at ${hex(pc)} (did you forget to exit with the exit syscall?)`
                : `attempt to execute non-instruction at ${hex(pc)}`);
            return this.state;
        }

        const word = this.mem.read32(pc);
        let next = (pc + 4) >>> 0;
        try {
            const res = this.exec(word, pc, next);
            if (res === 'wait') return this.state;
            if (res !== undefined) next = res >>> 0;
            this.pc = next;
            this.steps++;
        } catch (e) {
            if (!(e instanceof MachineException)) throw e;
            const [code, name] = this.cause(e.kind);
            if (this.trap(code, e, pc)) { this.steps++; return this.state; }
            this.fail(`Exception ${code} [${name}] at ${hex(pc)}: ${e.message}`);
        }
        return this.state;
    }

    protected fail(msg: string): void {
        this.error = msg;
        this.state = STATE.ERROR;
    }

    // ---------------- Syscalls ----------------
    /**
     * @desc: Reads a line from the io. Returns null (and waits) if not available.
    */
    protected read(kind: InputKind): string | null {
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

    /** Float syscalls (2, 3, 6, 7) of the architectures with a FPU */
    protected floatSyscall(code: number): ExecResult | false {
        void code;
        return false;
    }

    /**
     * @desc: SPIM / MARS / RARS syscalls. Number in ABI.code, result in ABI.ret
    */
    protected syscall(): ExecResult {
        const r = this.r, abi = this.ABI;
        const code = r[abi.code], a0 = r[abi.a0], a1 = r[abi.a1], a2 = r[abi.a2];

        if (code === 2 || code === 3 || code === 6 || code === 7) {
            const res = this.floatSyscall(code);
            if (res !== false) return res;
            throw new MachineException('syscall', `syscall ${code} needs a floating point unit`);
        }

        switch (code) {
            case 1:  this.write(a0); return;
            case 4:  this.write(this.mem.readString(this.checkAddr(a0, 1, false))); return;
            case 5: {
                const s = this.read('int');
                if (s === null) return 'wait';
                const m = /^\s*([-+]?(?:0[xX][0-9a-fA-F]+|\d+))/.exec(s);
                this.setReg(abi.ret, m ? Number(m[1]) | 0 : 0);
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
                this.setReg(abi.ret, this.heap | 0);
                this.heap = (this.heap + ((n + 7) & ~7)) >>> 0;
                return;
            }
            case 10: this.state = STATE.EXITED; this.exitCode = 0; return;
            case 11: this.write(String.fromCharCode(a0 & 0xff)); return;
            case 12: {
                const s = this.read('char');
                if (s === null) return 'wait';
                this.setReg(abi.ret, s.length ? s.charCodeAt(0) & 0xff : 10);
                return;
            }
            case 13: this.setReg(abi.ret, -1); return;                 // open (no file system)
            case 14: {                                                  // read (stdin only)
                if (a0 !== 0) { this.setReg(abi.ret, -1); return; }
                const s = this.read('string');
                if (s === null) return 'wait';
                const bytes = encodeUTF8(s + '\n').slice(0, Math.max(0, a2));
                bytes.forEach((b, i) => this.store8(a1 + i, b));
                this.setReg(abi.ret, bytes.length);
                return;
            }
            case 15: {                                                  // write (stdout / stderr)
                if (a0 !== 1 && a0 !== 2) { this.setReg(abi.ret, -1); return; }
                const n = Math.max(0, a2);
                const bytes: number[] = [];
                for (let i = 0; i < n; i++) bytes.push(this.load8(a1 + i));
                this.write(decodeUTF8(bytes));
                this.setReg(abi.ret, n);
                return;
            }
            case 16: this.setReg(abi.ret, 0); return;                  // close
            case 17: case 93: this.state = STATE.EXITED; this.exitCode = a0; return;
            case 30: {
                const t = BigInt(Date.now());
                this.setReg(abi.a0, Number(BigInt.asIntN(32, t)));
                this.setReg(abi.a1, Number(BigInt.asIntN(32, t >> 32n)));
                return;
            }
            case 31: case 32: case 33: return;                          // MIDI / sleep (ignored)
            case 34: this.write(hex(a0)); return;
            case 35: this.write((a0 >>> 0).toString(2).padStart(32, '0')); return;
            case 36: this.write(a0 >>> 0); return;
            case 40: this.rand = seed(a1); return;
            case 41: this.setReg(abi.a0, this.rand() | 0); return;
            case 42: this.setReg(abi.a0, a1 > 0 ? this.rand() % a1 : 0); return;
        }
        throw new MachineException('syscall', `unknown syscall ${code}`);
    }
}

const seed = (s: number): (() => number) => {
    let x = (s >>> 0) || 1;
    return () => {
        x ^= x << 13; x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5; x >>>= 0;
        return x;
    };
};
