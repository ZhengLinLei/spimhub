/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/pipeline.ts

    [pipeline] group: didactic view of the 5 stage pipeline (IF ID EX MEM WB)
    for the program loaded in the runner.

        ┌ datapath ─────────────────────────────┐ ┌ memory map ┐
        │ PC → IMem │ Regs │ ALU │ DMem │ WB      │ │ stack / sp │
        │ forwarding paths, stalls, flushes     │ │ heap, data │
        └───────────────────────────────────────┘ │ text  ← PC │
        ┌ diagram: instructions x cycles ────────┐ └────────────┘
        │ IF ID EX MEM WB, stalls (*), flushes   │  hazards / CPI
        └────────────────────────────────────────┘

    The schedule is computed by the engine (src/ts/engine/pipeline).

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface PipelineGUI {
    refresh(): void;
    open(): void;
    first(): void;
    prev(): void;
    next(): void;
    last(): void;
    play(): void;
    goto(cycle: number): void;
    select(row: number): void;
    toggle_forwarding(): void;
    toggle_branch(): void;
}

let PIPELINE: PipelineGUI;

window.addEventListener('load', () => {

    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const hex = SPIM.hex;
    const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'] as const;
    type StageName = typeof STAGES[number];
    type Row = import('../engine/spim').PipelineRow;
    type View = import('../engine/spim').CycleView;

    const escape = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    const el = {
        main: $('#main-pipeline'),
        file: $('#main-pipeline .pipeline-file'),
        cycle: $('#main-pipeline .pl-cycle'),
        forwarding: $('#main-pipeline .pl-forwarding'),
        branch: $('#main-pipeline .pl-branch'),
        play: $('#main-pipeline .pl-play'),
        datapath: $('#main-pipeline .pl-datapath'),
        memmap: $('#main-pipeline .pl-memmap'),
        stats: $('#main-pipeline .pl-stats'),
        diagram: $('#main-pipeline .pl-diagram'),
        hazards: $('#main-pipeline .pl-hazards'),
        empty: $('#main-pipeline .pl-empty'),
    };

    const state = {
        cycle: 0,
        selected: -1,           // Selected row (diagram)
        follow: true,           // Follow the execution of the runner
        driving: false,         // The pipeline view is executing instructions
        timer: null as ReturnType<typeof setInterval> | null,
    };

    const spim = () => RUNNER.spim;
    const model = () => spim().pipeline;
    const visible = () => el.main.classList.contains('active');

    // ================== //
    //  Datapath (SVG)    //
    // ================== //
    /*
        Static drawing, every element has an id (dp-*) that is activated
        (class "active" / "fwd") depending on the instructions of the cycle.
    */
    const COL: Record<StageName, [number, number]> = { IF: [6, 186], ID: [192, 386], EX: [392, 586], MEM: [592, 766], WB: [772, 954] };

    const block = (id: string, x: number, y: number, w: number, h: number, label: string, cls = 'dp-block') =>
        `<g id="dp-${id}" class="${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>` +
        label.split('\n').map((l, i, a) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (a.length - 1) / 2) * 13 + 4}">${l}</text>`).join('') + '</g>';
    const latch = (id: string, x: number, label: string) =>
        `<g id="dp-${id}" class="dp-latch"><rect x="${x}" y="64" width="12" height="244" rx="2"/>` +
        `<text x="${x + 6}" y="186" transform="rotate(-90 ${x + 6} 186)">${label}</text></g>`;
    const wire = (id: string, d: string, cls = 'dp-wire') => `<path id="dp-${id}" class="${cls}" d="${d}"/>`;

    const DATAPATH = () => `
    <svg viewBox="0 0 960 330" class="dp" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <marker id="dp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" class="dp-arrow-head"/>
            </marker>
        </defs>
        ${STAGES.map(s => `
            <g id="dp-stage-${s}" class="dp-stage">
                <rect x="${COL[s][0]}" y="2" width="${COL[s][1] - COL[s][0]}" height="46" rx="3"/>
                <text class="dp-stage-name" x="${COL[s][0] + 8}" y="18">${s}</text>
                <text class="dp-stage-state" x="${COL[s][1] - 8}" y="18" text-anchor="end"></text>
                <text class="dp-stage-instr" x="${COL[s][0] + 8}" y="38"></text>
            </g>`).join('')}

        ${wire('branch', 'M530,112 V58 H20 V150', 'dp-wire dp-branch')}
        ${wire('branch-id', 'M330,92 V58', 'dp-wire dp-branch')}
        ${wire('pc-imem', 'M74,170 H95')}
        ${wire('pc-add', 'M57,140 V84 H95')}
        ${wire('add-ifid', 'M135,84 H185')}
        ${wire('mux-pc', 'M30,170 H40')}
        ${wire('imem-ifid', 'M165,170 H185')}
        ${wire('ifid-rf', 'M197,170 H225')}
        ${wire('ifid-imm', 'M197,270 H245')}
        ${wire('rf-idex-a', 'M315,150 H385')}
        ${wire('rf-idex-b', 'M315,205 H385')}
        ${wire('imm-idex', 'M305,270 H385')}
        ${wire('idex-alu-a', 'M397,150 H455')}
        ${wire('idex-alu-b', 'M397,205 H455')}
        ${wire('idex-imm', 'M397,270 H440 V220 H455')}
        ${wire('idex-sd', 'M397,235 H585')}
        ${wire('alu-exmem', 'M520,175 H585')}
        ${wire('exmem-dmem', 'M597,175 H620')}
        ${wire('exmem-sd', 'M597,235 H610 V210 H620')}
        ${wire('exmem-bypass', 'M597,262 H765')}
        ${wire('dmem-memwb', 'M710,175 H765')}
        ${wire('memwb-mux', 'M777,175 H800')}
        ${wire('memwb-bypass', 'M777,262 H790 V190 H800')}
        ${wire('wb', 'M818,170 H846 V322 H210 V225 H225', 'dp-wire dp-wb')}

        ${wire('fwd-exmem', 'M591,240 V296 H410 V150 M410,205 H420', 'dp-fwd')}
        ${wire('fwd-memwb', 'M771,240 V310 H404 V140 M404,214 H420', 'dp-fwd')}
        ${wire('fwd-mem', 'M771,250 V284 H614 V220 H620', 'dp-fwd')}
        ${wire('fwd-id', 'M591,240 V290 H336 V100', 'dp-fwd')}

        <g id="dp-pcmux" class="dp-block"><rect x="12" y="148" width="18" height="44" rx="8"/></g>
        ${block('pc', 40, 140, 34, 60, 'PC')}
        ${block('add', 95, 70, 40, 28, '+4')}
        ${block('imem', 95, 120, 70, 100, T('Instr\nmemory'))}
        ${latch('ifid', 185, 'IF/ID')}
        ${block('rf', 225, 120, 90, 120, T('Registers'))}
        ${block('imm', 245, 255, 60, 30, 'Imm')}
        ${block('cmp', 318, 84, 26, 22, '=')}
        ${latch('idex', 385, 'ID/EX')}
        <g id="dp-alu" class="dp-block"><path d="M455,115 L520,140 L520,210 L455,235 L455,190 L470,175 L455,160 Z"/><text x="496" y="179">ALU</text></g>
        ${latch('exmem', 585, 'EX/MEM')}
        ${block('dmem', 620, 120, 90, 110, T('Data\nmemory'))}
        ${latch('memwb', 765, 'MEM/WB')}
        <g id="dp-wbmux" class="dp-block"><rect x="800" y="140" width="18" height="60" rx="8"/></g>

        <text id="dp-note-if" class="dp-note" x="96" y="236"></text>
        <text id="dp-note-id" class="dp-note" x="226" y="112"></text>
        <text id="dp-note-ex" class="dp-note" x="456" y="252"></text>
        <text id="dp-note-mem" class="dp-note" x="621" y="112"></text>
        <text id="dp-note-mem2" class="dp-note" x="621" y="246"></text>
        <text id="dp-note-wb" class="dp-note" x="852" y="176"></text>
        <text id="dp-note-branch" class="dp-note dp-note-branch" x="40" y="72"></text>
        <text id="dp-note-fwd" class="dp-note dp-note-fwd" x="420" y="326"></text>
    </svg>`;
    el.datapath.innerHTML = DATAPATH();

    const dp = (id: string) => el.datapath.querySelector<SVGElement>(`#dp-${id}`);
    const note = (id: string, text: string) => { dp(`note-${id}`).textContent = text; };
    const on = (ids: string[], cls = 'active') => ids.forEach(id => dp(id)?.classList.add(cls));

    const render_datapath = (v: View) => {
        el.datapath.querySelectorAll('.active, .fwd, .stall, .flush, .bubble, .run, .taken').forEach(e => e.classList.remove('active', 'fwd', 'stall', 'flush', 'bubble', 'run', 'taken'));
        ['if', 'id', 'ex', 'mem', 'mem2', 'wb', 'branch', 'fwd'].forEach(n => note(n, ''));
        const reg = (id: number) => spim().regName(id);

        STAGES.forEach(s => {
            const sv = v.stages[s];
            const g = dp(`stage-${s}`);
            g.classList.add(sv.state === 'idle' ? 'idle' : sv.state);
            const label = sv.state === 'bubble' ? T('bubble (nop)') : sv.state === 'idle' ? '' : sv.row ? sv.row.basic : '';
            g.querySelector('.dp-stage-instr').textContent = short(label, 30);
            g.querySelector('.dp-stage-state').textContent =
                sv.state === 'stall' ? 'stall' : sv.state === 'flush' ? 'flush' : sv.row ? `#${sv.row.id}` : '';
            if (sv.row) g.setAttribute('data-row', String(sv.row.id)); else g.removeAttribute('data-row');
        });

        const { IF, ID, EX, MEM, WB } = v.stages;
        if (IF.row) {
            on(['pc', 'imem', 'pc-imem', 'imem-ifid', 'add', 'pc-add', 'add-ifid', 'mux-pc', 'pcmux']);
            note('if', `fetch ${hex(IF.row.pc)}`);
        }
        if (ID.row) {
            on(['ifid', 'rf', 'ifid-rf', 'rf-idex-a', 'rf-idex-b', 'imm', 'ifid-imm', 'imm-idex']);
            const reads = ID.row.entry ? ID.row.entry.deps.reads.map(reg) : [];
            note('id', ID.state === 'stall' ? 'stalled: waiting for an operand' : reads.length ? `read ${reads.join(', ')}` : 'decode');
        }
        if (EX.row) {
            on(['idex', 'alu', 'idex-alu-a', 'idex-alu-b', 'alu-exmem', 'idex-imm']);
            if (EX.row.kind === 'store') on(['idex-sd']);
            note('ex', EX.row.kind === 'load' || EX.row.kind === 'store' ? 'address = base + offset'
                : EX.row.kind === 'branch' ? 'compare' : EX.row.basic.split(' ')[0]);
        }
        if (MEM.row) {
            on(['exmem']);
            const e = MEM.row.entry;
            if (MEM.row.kind === 'load' || MEM.row.kind === 'store') {
                on(['dmem', 'exmem-dmem', 'dmem-memwb']);
                if (MEM.row.kind === 'store') on(['exmem-sd']);
                note('mem', `${MEM.row.kind === 'load' ? 'read' : 'write'} ${e && e.memAddr !== undefined ? hex(e.memAddr) : ''}`);
            } else {
                on(['exmem-bypass']);
                note('mem2', 'no memory access');
            }
        }
        if (WB.row) {
            on(['memwb', 'wbmux', 'memwb-mux', 'memwb-bypass']);
            const writes = WB.row.entry ? WB.row.entry.deps.writes.filter(r => r < 32).map(reg) : [];
            if (writes.length) { on(['wb', 'rf']); note('wb', `${writes.join(', ')} ←`); }
        }

        // Forwarding paths used in this cycle
        const fwd = v.forwards.map(f => {
            const id = f.path.startsWith('EX/MEM') ? (f.path.endsWith('ID') ? 'fwd-id' : 'fwd-exmem') : f.path.endsWith('MEM') ? 'fwd-mem' : 'fwd-memwb';
            on([id], 'fwd');
            return `${reg(f.reg)}: ${f.path}`;
        });
        if (fwd.length) note('fwd', `forwarding ${fwd.join(' · ')}`);

        // Taken branch / jump redirects the fetch
        if (v.redirect) {
            const r = v.redirect;
            const inID = r.kind === 'jump' || model().options.branchStage === 'ID';
            on([inID ? 'branch-id' : 'branch', 'branch', 'pcmux'], 'taken');
            if (inID) on(['cmp'], 'taken');
            note('branch', `${r.basic.split(' ')[0]} taken → ${hex(r.entry ? r.entry.next : 0)}: flush IF${inID ? '' : ' + ID'}`);
        }
        if (model().options.branchStage !== 'ID') dp('cmp').classList.add('hidden'); else dp('cmp').classList.remove('hidden');
    };

    // ================== //
    //  Memory map (SVG)  //
    // ================== //
    const render_memmap = (v: View) => {
        const s = spim();
        const p = s.program;
        if (!p) { el.memmap.innerHTML = ''; return; }
        const cpu = s.cpu;
        const sp = cpu.r[s.arch === 'riscv' ? 2 : 29] >>> 0;
        const heapStart = (p.dataEnd + 7) & ~7;

        // Segments drawn from top (high addresses) to bottom
        type Seg = { name: string; lo: number; hi: number; y: number; h: number; cls: string };
        const segs: Seg[] = [
            { name: 'stack', lo: Math.min(sp, SPIM.SP_INIT) - 64, hi: SPIM.SP_INIT + 4, y: 14, h: 70, cls: 'stack' },
            { name: 'free', lo: 0, hi: 0, y: 84, h: 34, cls: 'free' },
            { name: 'heap', lo: heapStart, hi: Math.max(cpu.heap, heapStart + 16), y: 118, h: 40, cls: 'heap' },
            { name: '.data', lo: p.dataStart, hi: Math.max(p.dataEnd, p.dataStart + 16), y: 158, h: 60, cls: 'data' },
            { name: '.text', lo: p.textStart, hi: p.textEnd, y: 228, h: 76, cls: 'text' },
        ];
        const where = (addr: number): number | null => {
            for (const g of segs) {
                if (g.cls === 'free') continue;
                if (addr >= g.lo && addr < g.hi + 4) {
                    const t = (addr - g.lo) / Math.max(4, g.hi - g.lo);
                    return g.y + g.h - 4 - t * (g.h - 8);       // high addresses on top
                }
            }
            return null;
        };

        let svg = `<svg viewBox="0 0 300 320" class="mm" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<text class="mm-title" x="8" y="10">memory map</text>`;
        segs.forEach(g => {
            svg += `<g class="mm-seg ${g.cls}"><rect x="8" y="${g.y}" width="120" height="${g.h}"/>`;
            svg += `<text x="68" y="${g.y + g.h / 2 + 4}">${g.name}</text>`;
            if (g.cls !== 'free') svg += `<text class="mm-addr" x="132" y="${g.y + g.h - 2}">${hex(g.lo)}</text>`;
            svg += `</g>`;
        });
        svg += `<text class="mm-addr" x="132" y="22">${hex(SPIM.SP_INIT)}</text>`;

        const marker = (addr: number | undefined, label: string, cls: string, dy = 0) => {
            if (addr === undefined) return;
            const y = where(addr >>> 0);
            if (y === null) return;
            svg += `<g class="mm-marker ${cls}"><path d="M200,${y + dy} H134" marker-end="url(#mm-arrow)"/>` +
                   `<text x="204" y="${y + dy + 4}">${escape(label)}</text></g>`;
        };
        svg += `<defs><marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>`;

        const ifRow = v.stages.IF.row;
        marker(ifRow ? ifRow.pc : s.pc, `IF ${hex(ifRow ? ifRow.pc : s.pc).slice(4)}`, 'pc');
        const memRow = v.stages.MEM.row;
        if (memRow && memRow.entry && memRow.entry.memAddr !== undefined) {
            marker(memRow.entry.memAddr, `${memRow.kind === 'load' ? 'lw' : 'sw'} ${hex(memRow.entry.memAddr).slice(4)}`, memRow.kind, -10);
        }
        marker(sp, `sp ${hex(sp).slice(4)}`, 'sp', 10);
        if (cpu.heap > heapStart) marker(cpu.heap - 4, 'heap top', 'heaptop');
        svg += `</svg>`;
        el.memmap.innerHTML = svg;
    };

    // ================== //
    //  Stats / hazards   //
    // ================== //
    const render_stats = () => {
        const st = model().stats();
        const opt = model().options;
        const limited = spim().trace.length >= spim().traceLimit;
        el.stats.innerHTML = `
            <div><span class="muted">[arch]</span> ${escape(spim().archLabel)}</div>
            <div><span class="muted">[cycles]</span> ${st.cycles}</div>
            <div><span class="muted">[instructions]</span> ${st.instructions}</div>
            <div><span class="muted">[CPI]</span> <b>${st.cpi.toFixed(2)}</b> <span class="muted">[IPC]</span> ${st.ipc.toFixed(2)}</div>
            <div><span class="muted">[stalls]</span> ${st.stalls} <span class="muted">data</span></div>
            <div><span class="muted">[flushes]</span> ${st.flushes} <span class="muted">control</span></div>
            <div><span class="muted">[forwards]</span> ${st.forwards}${opt.forwarding ? '' : ' <span class="muted">(off)</span>'}</div>
            ${limited ? `<div class="text-error">trace limited to ${spim().traceLimit} instructions</div>` : ''}`;
    };

    const render_hazards = (v: View) => {
        const lines: string[] = [];
        const rows = model().rows;
        const add = (cls: string, html: string) => lines.push(`<li class="${cls}">${html}</li>`);

        add('head', `cycle ${v.cycle}`);
        STAGES.forEach(s => {
            const sv = v.stages[s];
            const what = sv.state === 'bubble' ? '<span class="muted">bubble (nop)</span>'
                : sv.row ? `#${sv.row.id} ${escape(sv.row.basic)}${sv.state === 'stall' ? ' <b>(stall)</b>' : sv.state === 'flush' ? ' <b>(wrong path)</b>' : ''}`
                : '<span class="muted">-</span>';
            add(`stage st-line-${s}`, `<span class="stage-name">${s}</span> ${what}`);
        });
        if (v.stages.ID.state === 'stall') {
            const r = v.stages.ID.row;
            const h = r.hazards.find(x => x.stalls && x.type !== 'control');
            add('stall', `ID stalled: ${escape(h ? h.text : 'data hazard')}`);
        }
        if (v.stages.EX.state === 'bubble' && v.cycle <= model().cycles) add('bubble', 'EX: bubble (nop) inserted');
        v.forwards.forEach(f => add('fwd', `forwarding ${escape(spim().regName(f.reg))}: ${f.path} <span class="muted">(#${f.from} → #${f.to})</span>`));
        if (v.redirect) {
            const h = v.redirect.hazards.find(x => x.type === 'control');
            add('flush', escape(h ? h.text : 'control hazard'));
        }
        STAGES.forEach(s => {
            if (v.stages[s].state === 'flush') add('flush', `${s}: #${v.stages[s].row.id} wrong path, it will be flushed`);
        });

        const sel = rows[state.selected];
        if (sel) {
            add('head', `#${sel.id} ${escape(sel.basic)}${sel.line ? ` <span class="muted">line ${sel.line}</span>` : ''}`);
            if (sel.flushed) add('flush', 'fetched on the wrong path and flushed');
            else {
                add('', `<span class="muted">IF</span> ${sel.IF} <span class="muted">ID</span> ${sel.ID} <span class="muted">EX</span> ${sel.EX} <span class="muted">MEM</span> ${sel.MEM} <span class="muted">WB</span> ${sel.WB}`);
                if (!sel.hazards.length) add('ok', 'no hazards');
                sel.hazards.forEach(h => add(h.type === 'control' ? 'flush' : h.stalls ? 'stall' : 'fwd', escape(h.text)));
            }
        }
        el.hazards.innerHTML = `<ul>${lines.join('')}</ul>`;
    };

    // ================== //
    //  Diagram           //
    // ================== //
    // Cycles that fit in the diagram
    const window_size = () => Math.max(8, Math.min(40, Math.floor((el.diagram.clientWidth - 300) / 42)));

    const cell_of = (r: Row, c: number): [string, string] => {
        if (r.flushed) {
            if (c >= r.IF && c <= r.endIF) return ['IF', 'flush'];
            if (r.ID && c >= r.ID && c <= r.endID) return ['ID', 'flush'];
            if (c === r.flushCycle) return ['✕', 'flushed'];
            return ['', ''];
        }
        if (c >= r.IF && c <= r.endIF) return c === r.IF ? ['IF', 'st-IF'] : ['IF', 'stall'];
        if (c >= r.ID && c <= r.endID) return c === r.ID ? ['ID', 'st-ID'] : ['stall', 'stall'];
        if (c === r.EX) return ['EX', 'st-EX'];
        if (c === r.MEM) return ['MEM', 'st-MEM'];
        if (c === r.WB) return ['WB', 'st-WB'];
        return ['', ''];
    };

    const render_diagram = (v: View) => {
        const rows = model().rows;
        const total = Math.max(model().cycles, 1);
        const size = window_size();
        const start = Math.max(1, Math.min(v.cycle - Math.floor(size / 2), total - size + 1));
        const end = start + size - 1;
        const shown = rows.filter(r => {
            const last = r.flushed ? Math.max(r.flushCycle, r.endIF) : r.WB;
            return last >= start && r.IF <= end;
        }).slice(-26);
        const sel = rows[state.selected];
        const producers = new Set(sel ? sel.hazards.filter(h => h.from !== undefined && h.from !== sel.id).map(h => h.from) : []);

        let html = '<table><thead><tr><th>[#]</th><th>[instruction]</th>';
        for (let c = start; c <= end; c++) {
            html += `<th class="cyc${c === v.cycle ? ' now' : ''}" onclick="PIPELINE.goto(${c})">${c}</th>`;
        }
        html += '</tr></thead><tbody>';
        shown.forEach(r => {
            const cls = [r.flushed ? 'flushed' : '', r.id === state.selected ? 'selected' : '', producers.has(r.id) ? 'producer' : ''].join(' ');
            const marks = r.hazards.map(h => h.type === 'control' ? '<span class="hz hz-control" title="control hazard">C</span>'
                : h.stalls ? `<span class="hz hz-stall" title="${escape(h.text)}">S</span>` : `<span class="hz hz-fwd" title="${escape(h.text)}">F</span>`).join('');
            html += `<tr class="${cls}" onclick="PIPELINE.select(${r.id})"><td>${r.id}</td><td title="${escape(r.source || r.basic)}">${escape(short(r.basic, 26))} ${marks}</td>`;
            for (let c = start; c <= end; c++) {
                const [text, k] = cell_of(r, c);
                const fwd = r.forwards.find(f => f.cycle === c);
                html += `<td class="${k}${c === v.cycle ? ' now' : ''}"${fwd ? ` title="${escape(spim().regName(fwd.reg) + ': ' + fwd.path)}"` : ''}>${text}${fwd ? '<i class="fwd-dot"></i>' : ''}</td>`;
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        el.diagram.innerHTML = html;
    };

    // ================== //
    //  Refresh / control //
    // ================== //
    const render = () => {
        const has = !!spim().program && spim().loaded;
        el.main.classList.toggle('empty', !has);
        el.file.innerHTML = has ? `[${escape(RUNNER.route || '')}] [${escape(spim().archLabel)}]` : '';
        el.forwarding.innerHTML = `[forwarding: ${model().options.forwarding ? 'on' : 'off'}]`;
        el.forwarding.classList.toggle('off', !model().options.forwarding);
        el.branch.innerHTML = `[branch: ${model().options.branchStage}]`;
        if (!has) return;
        const total = model().cycles;
        state.cycle = Math.max(total ? 1 : 0, Math.min(state.cycle, total));
        el.cycle.innerHTML = `[cycle ${state.cycle} / ${total}]`;
        const v = model().at(state.cycle);
        render_datapath(v);
        render_memmap(v);
        render_stats();
        render_hazards(v);
        render_diagram(v);
    };

    /** Called by the runner after each step / run */
    const refresh = () => {
        if (!state.driving && state.follow) {
            // Show the cycle where the last executed instruction is fetched... until it finishes
            const rows = model().rows.filter(r => !r.flushed);
            const last = rows[rows.length - 1];
            state.cycle = last ? (spim().state === 'exited' || spim().state === 'error' ? model().cycles : last.ID) : 0;
        }
        if (visible()) render();
    };

    // Executes instructions until every instruction present in `cycle` is known
    const ensure = (cycle: number) => {
        const s = spim();
        state.driving = true;
        try {
            let guard = 0;
            while (s.state === 'ready' && guard++ < 64) {
                const rows = s.pipeline.rows.filter(r => !r.flushed);
                const last = rows[rows.length - 1];
                if (last && last.ID > cycle) break;
                if (s.trace.length >= s.traceLimit) break;
                RUNNER.step();
            }
        } finally {
            state.driving = false;
        }
    };

    const goto = (cycle: number) => {
        state.follow = false;
        if (!spim().loaded && !RUNNER.assemble(undefined, false)) return;
        ensure(cycle);
        state.cycle = Math.max(1, Math.min(cycle, model().cycles));
        render();
    };

    const stop_play = () => {
        if (state.timer) clearInterval(state.timer);
        state.timer = null;
        el.play.innerHTML = '[play]';
    };

    PIPELINE = {
        refresh,
        open: () => { __group_h.open_group('pipeline'); render(); },
        first: () => { stop_play(); goto(1); },
        prev: () => { stop_play(); goto(state.cycle - 1); },
        next: () => {
            if (!spim().loaded) { goto(1); return; }
            goto(state.cycle + 1);
        },
        last: () => {
            stop_play();
            state.follow = true;
            RUNNER.run(false);
        },
        play: () => {
            if (state.timer) { stop_play(); return; }
            el.play.innerHTML = '[pause]';
            state.timer = setInterval(() => {
                const before = state.cycle;
                PIPELINE.next();
                if (state.cycle === before || !visible()) stop_play();
            }, 650);
        },
        goto,
        select: (row: number) => {
            state.selected = state.selected === row ? -1 : row;
            render();
        },
        toggle_forwarding: () => {
            spim().setPipelineOptions({ forwarding: !model().options.forwarding });
            RUNNER.log(`pipeline: forwarding ${model().options.forwarding ? 'on' : 'off'}, CPI ${model().stats().cpi.toFixed(2)}`);
            render();
        },
        toggle_branch: () => {
            spim().setPipelineOptions({ branchStage: model().options.branchStage === 'EX' ? 'ID' : 'EX' });
            RUNNER.log(`pipeline: branches resolved in ${model().options.branchStage}, CPI ${model().stats().cpi.toFixed(2)}`);
            render();
        },
    };

    // Click on a stage of the datapath selects its instruction
    el.datapath.addEventListener('click', (e) => {
        const g = (e.target as Element).closest('.dp-stage');
        const id = g && g.getAttribute('data-row');
        if (id !== null && id !== undefined) PIPELINE.select(+id);
    });

    // The labels of the datapath are drawn with T(): draw it again in the new language
    HUB.on('lang', () => {
        el.datapath.innerHTML = DATAPATH();
        render();
    });

    render();
});
