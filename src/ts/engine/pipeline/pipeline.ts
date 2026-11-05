/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/engine/pipeline/pipeline.ts

    Didactic model of the classic 5 stage in-order pipeline (Patterson &
    Hennessy) for MIPS and RISC-V:

            IF ──> ID ──> EX ──> MEM ──> WB
          fetch  decode  ALU   memory  write
                 regs                  back

    The functional simulator executes the program; every executed
    instruction is a TraceEntry. This model computes, cycle by cycle, where
    each instruction is, and explains the hazards:

        - Data hazards (RAW): stalls (bubbles) or forwarding
              EX/MEM -> EX, MEM/WB -> EX, MEM/WB -> MEM, EX/MEM -> ID
        - Load-use hazards: 1 stall even with forwarding
        - Control hazards: predict not taken, the wrong path instructions
          fetched before the branch is resolved (ID or EX) are flushed

    Options: forwarding on / off, branches resolved in ID or EX.
    Simplifications: 1 cycle EX for every instruction (mul / div / FPU
    included), perfect caches, register file written in the first half of
    the cycle and read in the second half.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

// ================== //
//  Types             //
// ================== //
export type InstrKind = 'alu' | 'mul' | 'fpu' | 'load' | 'store' | 'branch' | 'jump' | 'jumpr' | 'syscall' | 'nop' | 'other';

/** Registers of an instruction (given by mips/isa.ts and riscv/isa.ts) */
export interface Deps {
    reads: number[];
    writes: number[];
    kind: InstrKind;
    storeData?: number[];                                   // Sources needed in MEM (store data)
    mem?: { base: number; offset: number; size: number };   // Address = base + offset
}

/** One executed instruction */
export interface TraceEntry {
    seq: number;
    pc: number;
    word: number;
    basic: string;
    source: string;
    line: number;
    deps: Deps;
    next: number;           // pc after the instruction
    taken: boolean;         // the control flow did not continue at pc + 4
    memAddr?: number;       // effective address of loads / stores
}

/** Instruction fetched on the wrong path (it is flushed) */
export interface Fetched { word: number; basic: string; source: string; line: number; }

export type Stage = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB';
export const STAGES: Stage[] = ['IF', 'ID', 'EX', 'MEM', 'WB'];

export interface PipelineOptions {
    forwarding: boolean;
    branchStage: 'ID' | 'EX';       // Stage where branches / jr are resolved
}

export interface Forward {
    reg: number;
    from: number;           // Row of the producer
    path: string;           // 'EX/MEM → EX' ...
    cycle: number;
}

export interface Hazard {
    type: 'data' | 'load-use' | 'control';
    reg?: number;
    from?: number;          // Row of the producer / branch
    stalls: number;         // Cycles lost
    text: string;
}

export interface Row {
    id: number;
    entry: TraceEntry | null;       // null: wrong path instruction
    pc: number;
    word: number;
    basic: string;
    source: string;
    line: number;
    kind: InstrKind;
    flushed: boolean;
    // Cycle in which the instruction enters each stage (0 = never)
    IF: number; ID: number; EX: number; MEM: number; WB: number;
    // Last cycle in each stage (stalls make IF / ID longer)
    endIF: number; endID: number;
    flushCycle: number;             // Cycle where a wrong path instruction disappears
    resolve: number;                // Cycle where a taken branch / jump redirects the fetch (0: none)
    stalls: number;                 // Cycles held in ID by data hazards
    hazards: Hazard[];
    forwards: Forward[];
}

export interface StageView {
    row: Row | null;
    state: 'run' | 'stall' | 'bubble' | 'flush' | 'idle';
}

export interface CycleView {
    cycle: number;
    stages: Record<Stage, StageView>;
    forwards: (Forward & { to: number })[];
    redirect: Row | null;           // branch / jump resolved in this cycle (taken)
}

export interface Stats {
    cycles: number;
    instructions: number;
    stalls: number;                 // Data hazard bubbles
    flushes: number;                // Wrong path instructions (1 lost cycle each)
    forwards: number;
    cpi: number;
    ipc: number;
}

const CONTROL: InstrKind[] = ['branch', 'jump', 'jumpr'];

// ================== //
//  Model             //
// ================== //
export class Pipeline {

    rows: Row[] = [];
    private lastReal: Row | null = null;
    private lastWriter = new Map<number, Row>();
    private redirect = 1;           // Earliest IF of the next correct instruction

    constructor(
        public options: PipelineOptions = { forwarding: true, branchStage: 'EX' },
        private fetch: (pc: number) => Fetched | null = () => null,
        public regName: (id: number) => string = (id) => `r${id}`,
    ) {}

    reset(): void {
        this.rows = [];
        this.lastReal = null;
        this.lastWriter.clear();
        this.redirect = 1;
    }

    /**
     * @desc: Recomputes the whole schedule (after changing the options)
    */
    rebuild(trace: TraceEntry[]): void {
        this.reset();
        trace.forEach(e => this.add(e));
    }

    private newRow(entry: TraceEntry | null, f: Fetched & { pc: number }, kind: InstrKind): Row {
        return {
            id: this.rows.length, entry,
            pc: f.pc, word: f.word, basic: f.basic, source: f.source, line: f.line, kind,
            flushed: !entry,
            IF: 0, ID: 0, EX: 0, MEM: 0, WB: 0, endIF: 0, endID: 0, flushCycle: 0, resolve: 0,
            stalls: 0, hazards: [], forwards: [],
        };
    }

    /**
     * @desc: Schedules the next executed instruction
    */
    add(entry: TraceEntry): Row {
        const { forwarding, branchStage } = this.options;
        const prev = this.lastReal;
        const d = entry.deps;
        const row = this.newRow(entry, entry, d.kind);

        // ---- Structural: one instruction per stage, in order ----
        row.IF = Math.max(prev ? prev.ID : 1, this.redirect);
        row.ID = Math.max(row.IF + 1, prev ? prev.EX : 0);
        const baseEX = Math.max(row.ID + 1, prev ? prev.MEM : 0);
        let EX = baseEX;

        // ---- Data hazards (RAW) ----
        const isControl = CONTROL.includes(d.kind);
        type Need = { reg: number; p: Row; stage: 'ID' | 'EX' | 'MEM'; bound: number };
        const needs: Need[] = [];
        [...new Set(d.reads)].forEach(reg => {
            const p = this.lastWriter.get(reg);
            if (!p) return;
            const stage = d.storeData?.includes(reg) ? 'MEM' : (isControl && branchStage === 'ID') ? 'ID' : 'EX';
            let bound: number;
            if (!forwarding) {
                // Read in the second half of the last ID cycle, written in the first half of WB
                bound = p.WB + 1;
            } else {
                const ready = p.kind === 'load' ? p.MEM : p.EX;     // Value exists at the end of this cycle
                bound = stage === 'EX' ? ready + 1 : stage === 'ID' ? ready + 2 : ready;
            }
            needs.push({ reg, p, stage, bound });
            EX = Math.max(EX, bound);
        });

        row.EX = EX;
        row.MEM = EX + 1;
        row.WB = EX + 2;
        row.endIF = row.ID - 1;
        row.endID = EX - 1;
        row.stalls = EX - baseEX;

        // Explain every dependency on an instruction still in the pipeline
        needs.forEach(n => {
            const read = row.EX - 1;            // Register file read (ID)
            const name = this.regName(n.reg);
            const producer = `#${n.p.id} ${n.p.basic}`;
            if (n.p.WB <= read) return;         // Already in the register file

            let path = '';
            if (forwarding) {
                if (n.stage === 'EX') path = n.p.MEM === row.EX ? 'EX/MEM → EX' : 'MEM/WB → EX';
                else if (n.stage === 'MEM') path = 'MEM/WB → MEM';
                else path = n.p.MEM === read ? 'EX/MEM → ID' : 'MEM/WB → ID';
                const cycle = n.stage === 'EX' ? row.EX : n.stage === 'MEM' ? row.MEM : read;
                row.forwards.push({ reg: n.reg, from: n.p.id, path, cycle });
            }
            const binding = n.bound === row.EX && row.stalls > 0;
            const stalls = binding ? row.stalls : 0;
            const loadUse = n.p.kind === 'load' && forwarding;
            row.hazards.push({
                type: loadUse && stalls ? 'load-use' : 'data',
                reg: n.reg, from: n.p.id, stalls,
                text: `RAW ${name} ← ${producer}: ` + (
                    stalls ? `${stalls} stall${stalls > 1 ? 's' : ''}${path ? ` + forwarding ${path}` : ''}` +
                             (loadUse ? ' (load-use)' : !forwarding ? ' (no forwarding)' : n.stage === 'ID' ? ' (branch in ID)' : '')
                           : `forwarding ${path}`),
            });
        });

        d.writes.forEach(reg => this.lastWriter.set(reg, row));
        this.rows.push(row);
        this.lastReal = row;

        // ---- Control hazards: predict not taken ----
        if (entry.taken && (isControl || d.kind === 'syscall' || d.kind === 'other')) {
            const inID = d.kind === 'jump' || branchStage === 'ID' || !isControl;
            const resolve = inID ? row.EX - 1 : row.EX;
            row.resolve = resolve;
            // Wrong path: pc + 4, pc + 8 ... fetched until the branch is resolved
            let flushed = 0;
            let pc = entry.pc + 4;
            let ifFree = row.ID;            // IF is free when the branch moves to ID
            let idFree = row.EX;            // ID is free when the branch moves to EX
            while (true) {
                const IF = Math.max(ifFree, row.IF + 1);
                if (IF > resolve) break;
                const f = this.fetch(pc);
                if (!f) break;
                const w = this.newRow(null, { ...f, pc }, 'other');
                w.IF = IF;
                const ID = Math.max(IF + 1, idFree);
                w.endIF = Math.min(ID - 1, resolve);
                if (ID <= resolve) {
                    // It stays in ID until the flush
                    w.ID = ID; w.endID = resolve;
                    ifFree = ID;
                    idFree = resolve + 1;
                } else {
                    ifFree = resolve + 1;
                }
                w.flushCycle = resolve + 1;
                this.rows.push(w);
                flushed++;
                pc += 4;
            }
            this.redirect = resolve + 1;
            const what = d.kind === 'jump' ? 'jump' : d.kind === 'jumpr' ? 'jump register' : d.kind === 'branch' ? 'taken branch' : 'exception';
            row.hazards.push({
                type: 'control', from: row.id, stalls: flushed,
                text: `${what} resolved in ${inID ? 'ID' : 'EX'}: ${flushed} instruction${flushed === 1 ? '' : 's'} flushed` +
                      ` (${flushed} cycle${flushed === 1 ? '' : 's'} lost)`,
            });
        } else {
            this.redirect = 1;
        }
        return row;
    }

    // ================== //
    //  Views             //
    // ================== //
    get cycles(): number {
        return this.lastReal ? this.lastReal.WB : 0;
    }

    stats(): Stats {
        const real = this.rows.filter(r => !r.flushed);
        const cycles = this.cycles;
        const n = real.length;
        return {
            cycles,
            instructions: n,
            stalls: real.reduce((s, r) => s + r.stalls, 0),
            flushes: this.rows.length - n,
            forwards: real.reduce((s, r) => s + r.forwards.length, 0),
            cpi: n ? cycles / n : 0,
            ipc: cycles ? n / cycles : 0,
        };
    }

    /**
     * @desc: Where is every instruction in the given cycle
    */
    at(cycle: number): CycleView {
        const view: CycleView = {
            cycle,
            stages: { IF: idle(), ID: idle(), EX: idle(), MEM: idle(), WB: idle() },
            forwards: [],
            redirect: null,
        };
        // Rows near the cycle (IF is increasing)
        let lo = 0, hi = this.rows.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.rows[mid].IF < cycle - 64) lo = mid + 1; else hi = mid;
        }
        let started = false;
        for (let i = lo; i < this.rows.length; i++) {
            const r = this.rows[i];
            if (r.IF > cycle) break;
            started = true;
            const s = view.stages;
            if (r.flushed) {
                if (r.IF <= cycle && cycle <= r.endIF) s.IF = { row: r, state: 'flush' };
                else if (r.ID && r.ID <= cycle && cycle <= r.endID) s.ID = { row: r, state: 'flush' };
                continue;
            }
            if (r.IF <= cycle && cycle <= r.endIF) s.IF = { row: r, state: cycle > r.IF ? 'stall' : 'run' };
            if (r.ID <= cycle && cycle <= r.endID) s.ID = { row: r, state: cycle > r.ID ? 'stall' : 'run' };
            if (r.EX === cycle) s.EX = { row: r, state: 'run' };
            if (r.MEM === cycle) s.MEM = { row: r, state: 'run' };
            if (r.WB === cycle) s.WB = { row: r, state: 'run' };
            r.forwards.forEach(f => { if (f.cycle === cycle) view.forwards.push({ ...f, to: r.id }); });
            if (r.resolve === cycle) view.redirect = r;
        }
        // Empty stages inside a running pipeline are bubbles
        if (started && cycle <= this.cycles) {
            STAGES.forEach(st => {
                if (!view.stages[st].row && cycle >= 1) view.stages[st] = { row: null, state: 'bubble' };
            });
        }
        return view;
    }
}

const idle = (): StageView => ({ row: null, state: 'idle' });
