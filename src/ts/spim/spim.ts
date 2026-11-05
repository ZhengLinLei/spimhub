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


// Path: src/ts/spim/spim.ts



import * as ISA from './isa';
import { Assembler, Program, AssembleOptions, SEGMENT } from './assembler';
import { CPU, STATE, State, IO } from './cpu';

export interface RunResult { state: State; steps: number; breakpoint?: number; }

// SPIM class
//  Glue between the assembler (src/ts/spim/assembler.ts) and the
//  cpu (src/ts/spim/cpu.ts). The GUI and the CLI only talk to this class.
export default class SPIM {

    static ISA = ISA;
    static Assembler = Assembler;
    static CPU = CPU;
    static STATE = STATE;
    static REGISTERS = ISA.GPR_NAMES;
    static VERSION = '1.0.0';

    // Internal Variables
    private _instance: CPU;
    // Text memory address
    _textAddress = SEGMENT.text;
    // Data memory address
    _dataAddress = SEGMENT.data;

    io: IO;
    input: string[] = [];           // Queued input lines
    breakpoints = new Set<number>();
    assembler = new Assembler();
    program: Program | null = null;

    /**
     * @desc: Constructor; creates a new SPIM instance
     * @param: io {:IO} - { write(text), readLine(kind) -> string|null }
    */
    constructor(io: IO = {}) {
        this.io = io;
        this._instance = new CPU({
            write: (text) => this.io.write && this.io.write(text),
            readLine: (kind) => {
                if (this.input.length) return this.input.shift()!;
                return this.io.readLine ? this.io.readLine(kind) : null;
            },
        });
    }

    // Getters
    get cpu(): CPU { return this._instance; }
    get state(): State { return this._instance.state; }
    get pc(): number { return this._instance.pc >>> 0; }
    get loaded(): boolean { return !!this.program && this.program.ok; }

    /**
     * @desc: Assembles and loads the assembly code
     * @param: data {:string} - The assembly code to be run
     * @return: {:Program} - The assembled program (check .ok / .errors)
    */
    load(data: string, filename = 'file.asm', options: AssembleOptions = {}): Program {
        const program = this.assembler.assemble(data, { filename, ...options });
        this.program = program;
        this.input = [];
        this._instance.load(program.ok ? program : null);
        return program;
    }

    /**
     * @desc: Resets the SPIM instance (registers, memory) and reloads the program
    */
    reset(): void {
        this.input = [];
        this._instance.reset();
    }

    /**
     * @desc: Runs the assembly code step by step
    */
    runStep(): State {
        return this._instance.step();
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
        cpu.step(); steps++;
        const bp = this.breakpoints;
        while (cpu.state === STATE.READY && steps < maxSteps) {
            if (bp.size && bp.has(cpu.pc >>> 0)) return { state: cpu.state, steps, breakpoint: cpu.pc >>> 0 };
            cpu.step();
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
     * @desc: Text segment row for an address (or undefined)
    */
    textAt(addr: number) {
        return this.program?.text.find(t => t.addr === (addr >>> 0));
    }

    readWord(addr: number): number { return this._instance.mem.read32(addr >>> 0); }
    readByte(addr: number): number { return this._instance.mem.read8(addr >>> 0); }
}

export type { Program, State, IO };
