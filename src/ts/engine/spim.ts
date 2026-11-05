/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Zheng Lin Lei



    This file is part of SpimHub.

            _            _        _         _   _         _       _    _                  _        
           / /\         /\ \     /\ \      /\_\/\_\ _    / /\    / /\ /\_\               / /\      
          / /  \       /  \ \    \ \ \    / / / / //\_\ / / /   / / // / /         _    / /  \     
         / / /\ \__   / /\ \ \   /\ \_\  /\ \/ \ \/ / // /_/   / / / \ \ \__      /\_\ / / /\ \    
        / / /\ \___\ / / /\ \_\ / /\/_/ /  \____\__/ // /\ \__/ / /   \ \___\    / / // / /\ \ \   
        \ \ \ \/___// / /_/ / // / /   / /\/________// /\ \___\/ /     \__  /   / / // / /\ \_\ \  
         \ \ \     / / /__\/ // / /   / / /\/_// / // / /\/___/ /      / / /   / / // / /\ \ \___\ 
     _    \ \ \   / / /_____// / /   / / /    / / // / /   / / /      / / /   / / // / /  \ \ \__/ 
    /_/\__/ / /  / / /   ___/ / /__ / / /    / / // / /   / / /      / / /___/ / // / /____\_\ \   
    \ \/___/ /  / / /   /\__\/_/___\\/_/    / / // / /   / / /      / / /____\/ // / /__________\  
     \_____\/   \/_/    \/_________/        \/_/ \/_/    \/_/       \/_________/ \/_____________/  
                                                                                               



    © 2026 ZhengLinLei <zheng9112003@icloud.com>

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
    LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
    OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
    WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 ========================================================================== */


// Path: src/ts/engine/spim.ts


import { Assembler as CoreAssembler, Arch, ArchName, Program, AssembleOptions, SEGMENT, TextRow } from './core/asm';
import { STATE, State, IO, SP_INIT, GP_INIT, hex } from './core/machine';
import * as ISA from './mips/isa';
import * as RVISA from './riscv/isa';
import { MIPS } from './mips/asm';
import { RISCV } from './riscv/asm';
import { MipsCPU } from './mips/cpu';
import { RiscvCPU } from './riscv/cpu';
import { Pipeline, PipelineOptions, TraceEntry, Deps, STAGES } from './pipeline/pipeline';

export interface RunResult { state: State; steps: number; breakpoint?: number; }
export interface LoadOptions extends AssembleOptions { arch?: ArchName | 'auto'; }

const ARCHS: Record<ArchName, { asm: Arch; deps: (w: number) => Deps; regName: (id: number) => string; registers: readonly string[] }> = {
    mips:  { asm: MIPS,  deps: ISA.deps,   regName: ISA.regName,   registers: ISA.GPR_NAMES.map(n => '$' + n) },
    riscv: { asm: RISCV, deps: RVISA.deps, regName: RVISA.regName, registers: RVISA.ABI_NAMES },
};

/**
 * @desc: Guesses the architecture of a source file
 *        "# arch: riscv" / "# arch: mips" forces it
*/
export const detectArch = (source: string): ArchName => {
    const pragma = /^\s*[#;]\s*(?:arch|isa)\s*[:=]\s*(mips|risc-?v|rv32\w*)/im.exec(source);
    if (pragma) return pragma[1].toLowerCase().startsWith('mips') ? 'mips' : 'riscv';
    const code = source.split('\n').map(l => l.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/#.*/, '')).join('\n');
    const mips = (code.match(/\$[a-z0-9]+/gi) || []).length + 3 * (code.match(/\bsyscall\b/g) || []).length;
    const riscv = (code.match(/(?:^|[\s,(])(?:x\d{1,2}|zero|ra|sp|a[0-7]|t[0-6]|s(?:1[01]|[0-9])|fp)\b/gm) || []).length
        + 3 * (code.match(/\b(?:ecall|ebreak|auipc|ret|mv|call|slli|srli|srai)\b/g) || []).length;
    return riscv > mips ? 'riscv' : 'mips';
};

// Assembler of one architecture (MIPS by default, as the original SPIM class)
export class Assembler extends CoreAssembler {
    constructor(arch: Arch | ArchName = MIPS) {
        super(typeof arch === 'string' ? ARCHS[arch].asm : arch);
    }
}

// SPIM class
//  Glue between the assemblers (src/ts/engine/{mips,riscv}/asm.ts), the
//  cpus (src/ts/engine/{mips,riscv}/cpu.ts) and the pipeline model.
//  The GUI and the CLI only talk to this class.
export default class SPIM {

    static ISA = ISA;
    static RISCV = RVISA;
    static Assembler = Assembler;
    static CPU = MipsCPU;
    static RiscvCPU = RiscvCPU;
    static Pipeline = Pipeline;
    static STAGES = STAGES;
    static STATE = STATE;
    static SEGMENT = SEGMENT;
    static SP_INIT = SP_INIT;
    static GP_INIT = GP_INIT;
    static REGISTERS = ISA.GPR_NAMES;
    static VERSION = '1.1.0';
    static detectArch = detectArch;
    static hex = hex;

    // Internal Variables
    private _instance: MipsCPU | RiscvCPU;
    // Text memory address
    _textAddress = SEGMENT.text;
    // Data memory address
    _dataAddress = SEGMENT.data;

    io: IO;
    input: string[] = [];           // Queued input lines
    breakpoints = new Set<number>();
    program: Program | null = null;
    arch: ArchName = 'mips';
    private textMap = new Map<number, TextRow>();

    // Pipeline (every executed instruction is traced, up to traceLimit)
    trace: TraceEntry[] = [];
    traceLimit = 20000;
    pipeline: Pipeline;

    /**
     * @desc: Constructor; creates a new SPIM instance
     * @param: io {:IO} - { write(text), readLine(kind) -> string|null }
    */
    constructor(io: IO = {}) {
        this.io = io;
        this._instance = this.createCPU('mips');
        this.pipeline = new Pipeline({ forwarding: true, branchStage: 'EX' }, (pc) => this.fetch(pc), ISA.regName);
    }

    private createCPU(arch: ArchName): MipsCPU | RiscvCPU {
        const io: IO = {
            write: (text) => this.io.write && this.io.write(text),
            readLine: (kind) => {
                if (this.input.length) return this.input.shift()!;
                return this.io.readLine ? this.io.readLine(kind) : null;
            },
        };
        return arch === 'riscv' ? new RiscvCPU(io) : new MipsCPU(io);
    }

    // Getters
    get cpu(): MipsCPU | RiscvCPU { return this._instance; }
    get state(): State { return this._instance.state; }
    get pc(): number { return this._instance.pc >>> 0; }
    get loaded(): boolean { return !!this.program && this.program.ok; }
    /** Register names of the loaded architecture ($zero... / zero...) */
    get registers(): readonly string[] { return ARCHS[this.arch].registers; }
    get archLabel(): string { return ARCHS[this.arch].asm.label; }
    regName(id: number): string { return ARCHS[this.arch].regName(id); }

    /**
     * @desc: Assembles and loads the assembly code
     * @param: data {:string} - The assembly code to be run
     * @return: {:Program} - The assembled program (check .ok / .errors)
    */
    load(data: string, filename = 'file.asm', options: LoadOptions = {}): Program {
        const { arch: wanted = 'auto', ...asmOptions } = options;
        const arch = wanted === 'auto' ? detectArch(data) : wanted;
        if (arch !== this.arch || this._instance.arch !== arch) {
            this.arch = arch;
            this._instance = this.createCPU(arch);
        }
        const program = new Assembler(arch).assemble(data, { filename, ...asmOptions });
        this.program = program;
        this.textMap = new Map(program.text.map(t => [t.addr, t]));
        this.input = [];
        this.pipeline.regName = ARCHS[arch].regName;
        this._instance.load(program.ok ? program : null);
        this.resetTrace();
        return program;
    }

    /**
     * @desc: Resets the SPIM instance (registers, memory) and reloads the program
    */
    reset(): void {
        this.input = [];
        this._instance.reset();
        this.resetTrace();
    }

    private resetTrace(): void {
        this.trace = [];
        this.pipeline.reset();
    }

    /** Wrong path fetch for the pipeline model */
    private fetch(pc: number) {
        const t = this.textMap.get(pc >>> 0);
        return t ? { word: t.word, basic: t.basic, source: t.source, line: t.line } : null;
    }

    /**
     * @desc: Executes one instruction and records it in the trace
    */
    private stepOne(): State {
        const cpu = this._instance;
        if (this.trace.length >= this.traceLimit || cpu.state === STATE.INPUT && !this.input.length && !this.io.readLine) {
            return cpu.step();
        }
        const pc = cpu.pc >>> 0;
        const steps = cpu.steps;
        const word = cpu.mem.read32(pc);
        const deps = ARCHS[this.arch].deps(word);
        const memAddr = deps.mem ? ((cpu.r[deps.mem.base] + deps.mem.offset) >>> 0) : undefined;

        const state = cpu.step();
        if (cpu.steps !== steps) {
            const t = this.textMap.get(pc);
            const next = cpu.pc >>> 0;
            const entry: TraceEntry = {
                seq: this.trace.length, pc, word,
                basic: t ? t.basic : ARCHS[this.arch].asm.disassemble(word, pc),
                source: t ? t.source : '', line: t ? t.line : 0,
                deps, next, taken: next !== ((pc + 4) >>> 0), memAddr,
            };
            this.trace.push(entry);
            this.pipeline.add(entry);
        }
        return state;
    }

    /**
     * @desc: Runs the assembly code step by step
    */
    runStep(): State {
        return this.stepOne();
    }

    /**
     * @desc: Runs the assembly code until the next breakpoint, an input
     *        request, the end of the program or `maxSteps` instructions
    */
    run(maxSteps = 100000): RunResult {
        const cpu = this._instance;
        let steps = 0;
        if (cpu.state !== STATE.READY && cpu.state !== STATE.INPUT) return { state: cpu.state, steps };

        // Always execute the first instruction (allows to continue from a breakpoint)
        this.stepOne(); steps++;
        const bp = this.breakpoints;
        while (cpu.state === STATE.READY && steps < maxSteps) {
            if (bp.size && bp.has(cpu.pc >>> 0)) return { state: cpu.state, steps, breakpoint: cpu.pc >>> 0 };
            this.stepOne();
            steps++;
        }
        return { state: cpu.state, steps };
    }

    /**
     * @desc: Runs the assembly code all at once (synchronous, used by the CLI)
    */
    runAll(maxSteps = 10000000): RunResult {
        return this.run(maxSteps);
    }

    /**
     * @desc: Gives a line of input to a program waiting in a read syscall
    */
    provideInput(line: string): void {
        this.input.push(String(line));
    }

    toggleBreakpoint(addr: number, on?: boolean): boolean {
        addr >>>= 0;
        if (on === undefined) on = !this.breakpoints.has(addr);
        if (on) this.breakpoints.add(addr); else this.breakpoints.delete(addr);
        return on;
    }

    /**
     * @desc: Changes the pipeline options and recomputes the schedule
    */
    setPipelineOptions(options: Partial<PipelineOptions>): void {
        Object.assign(this.pipeline.options, options);
        this.pipeline.rebuild(this.trace);
    }

    /**
     * @desc: Text segment row for an address (or undefined)
    */
    textAt(addr: number): TextRow | undefined {
        return this.textMap.get(addr >>> 0);
    }

    readWord(addr: number): number { return this._instance.mem.read32(addr >>> 0); }
    readByte(addr: number): number { return this._instance.mem.read8(addr >>> 0); }
}

export type { Program, State, IO, ArchName, TraceEntry, PipelineOptions };
export type { Row as PipelineRow, CycleView, Stage, Stats as PipelineStats } from './pipeline/pipeline';
