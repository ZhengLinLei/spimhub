/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/js/runner.js

    [runner] group: assembles the active file with SPIM (src/js/spim.js) and
    shows the text segment, data segment, registers and program i/o.

            editor [run] ──> RUNNER.assemble() ──> SPIM.load()
                                                     │
              text segment <── render ───────────────┤
              data segment <── render ───────────────┤
              registers    <── render ───────────────┘
              [output]     <── syscalls (print / read)

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface Runner {
    spim: SPIMInstance;
    assemble(file?: EditorFile, open?: boolean): boolean;
    load_source(route: string, content: string, file?: EditorFile | null, open?: boolean): boolean;
    run(show_output?: boolean): void;
    run_active(): void;
    step(): void;
    stop(verbose?: boolean): void;
    reset(): boolean;
    open_segment(name: string): void;
    toggle_ascii(): void;
    toggle_format(): void;
    toggle_arch(): void;
    set_arch(mode: 'auto' | 'mips' | 'riscv', reload?: boolean): void;
    scroll_pc(): void;
    show_breakpoints(): void;
    download_logs(): void;
    log(msg: string, type?: string): void;
    output(text: string): void;
    clear_output(): void;
    get_active(): EditorFile | null;
    readonly route: string | null;
    readonly arch_mode: 'auto' | 'mips' | 'riscv';
    readonly running: boolean;
}

let RUNNER: Runner;

window.addEventListener('load', () => {

    const $ = (sel) => document.querySelector(sel);
    const hex = SPIM.hex;

    // ================== //
    //  DOM               //
    // ================== //
    const el = {
        file: $('#main-runner .runner-file'),
        state: $('#main-runner .runner-state'),
        text: $('#text-segment'),
        textMain: $('#data-section .data-text .table-main'),
        textInfo: $('#data-section .text-info'),
        data: $('#data-segment'),
        dataMain: $('#data-section .data-data .table-main'),
        dataInfo: $('#data-section .data-info'),
        segmentTabs: document.querySelectorAll('#data-section .segment-tab'),
        ascii: $('#data-section .segment-ascii'),
        regs: $('#register-section .runner-register tbody'),
        cop1: $('#register-section .runner-coproc1 tbody'),
        cop0: $('#register-section .runner-coproc0 tbody'),
        format: $('#register-section .register-format'),
        archBadge: $('#main-runner .runner-arch'),
        archToggle: $('#main-runner .arch-toggle'),
        output: $('#output-main .output-log'),
        outputMain: $('#output-main'),
        inputBox: $('#output-main .output-input'),
        input: $('#output-input'),
        inputKind: $('#output-main .output-input-kind'),
        console: $('#console-main .console-log'),
        consoleMain: $('#console-main'),
    };

    // ================== //
    //  State             //
    // ================== //
    const state = {
        file: null,             // Editor metadata of the loaded file
        route: null,            // Route + name of the loaded file
        source: '',             // Source of the loaded file
        running: false,
        timer: null,
        paused: false,
        format: 'hex',          // Register / memory format: hex | dec
        arch: 'auto' as 'auto' | 'mips' | 'riscv',     // Architecture of the next assemble
        segment: 'data',        // Data segment view: data | heap | stack
        ascii: false,
        prev: null,             // Snapshot before the last step / run
        prevMem: new Map(),     // Memory words shown in the last render
        rows: new Map(),        // Text segment <tr> by address
        logs: [],
        outputBuffer: '',
        outputFlush: false,
    };

    const CHUNK = 25000;            // Instructions per tick while running
    const MAX_OUTPUT = 200000;      // Characters kept in [output]
    const MAX_ROWS = 512;           // Data segment rows

    // ================== //
    //  Console / output  //
    // ================== //
    const time = () => new Date().toTimeString().slice(0, 8);
    const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    /**
     * Writes a line into the [console] tab
     *
     * @param {String} msg
     * @param {String} type - info | error | success | warning
     */
    const log = (msg, type = 'info') => {
        state.logs.push(`[${time()}] ${msg}`);
        let line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = `<span class="muted">[${time()}]</span> ${escape(msg)}`;
        el.console.appendChild(line);
        el.consoleMain.scrollTop = el.consoleMain.scrollHeight;
    };

    const flush_output = () => {
        state.outputFlush = false;
        if (!state.outputBuffer) return;
        let text = el.output.textContent + state.outputBuffer;
        if (text.length > MAX_OUTPUT) text = text.slice(-MAX_OUTPUT);
        el.output.textContent = text;
        state.outputBuffer = '';
        el.outputMain.scrollTop = el.outputMain.scrollHeight;
    };

    // Program output (syscalls) is buffered and painted at most every 30ms
    // (setTimeout instead of requestAnimationFrame: it also runs in background tabs)
    const output = (text) => {
        HUB.emit('output', text);
        state.outputBuffer += text;
        if (!state.outputFlush) {
            state.outputFlush = true;
            setTimeout(flush_output, 30);
        }
    };

    const clear_output = () => {
        state.outputBuffer = '';
        el.output.textContent = '';
    };

    let warning_timer: ReturnType<typeof setTimeout>;
    const warning = (msg: string) => {
        let w = document.querySelector<HTMLElement>('section#warning');
        w.innerHTML = `<p>${escape(msg)}</p>`;
        w.classList.remove('active');
        void w.offsetWidth;     // Restart the animation
        w.classList.add('active');
        clearTimeout(warning_timer);
        warning_timer = setTimeout(() => w.classList.remove('active'), 10000);
    };

    const spim = new SPIM({ write: output });

    // ================== //
    //  Editor helpers    //
    // ================== //
    /**
     * @return {Object:WINDOW_EDITOR.files[:string][:num]} - Active file of the active window
     */
    const get_active = () => {
        let windows = [WINDOW_EDITOR.active, ...Object.keys(WINDOW_EDITOR.files).map(w => +w.slice(1))];
        for (let w of windows) {
            let file = (WINDOW_EDITOR.files[`w${w}`] || []).find(f => f.active);
            if (file) return file;
        }
        return null;
    };

    const set_status = (file, ok) => {
        if (!file) return;
        let status = file.__fw.closest('.editor-window')?.querySelector('.execute-status');
        if (!status) return;
        status.innerHTML = ok ? '[ok]' : '[error]';
        status.classList.remove('bg-success', 'bg-error');
        status.classList.add(ok ? 'bg-success' : 'bg-error');
        status.title = ok ? `${file.route}${file.name} assembled` : 'See [console] for the errors';
    };

    // Mark the lines with errors in the editor (removed when the code is edited)
    const mark_errors = (file, errors) => {
        let code = file.__f.querySelector('.export-code > code');
        let numbers = file.__f.querySelector('.line-numbers-rows');
        [...code.querySelectorAll('.asm-error'), ...numbers.querySelectorAll('.asm-error')].forEach(e => {
            e.classList.remove('asm-error');
            e.removeAttribute('title');
        });
        errors.forEach(err => {
            if (err.line < 1) return;
            [code.children[err.line - 1], numbers.children[err.line - 1]].forEach(e => {
                if (!e) return;
                e.classList.add('asm-error');
                e.title = err.message;
            });
        });
    };

    // ================== //
    //  Runner state      //
    // ================== //
    const STATE_CLASS = { ready: '', running: 'bg-success', input: 'bg-warning', exited: 'bg-success', error: 'bg-error', idle: '', paused: 'bg-warning' };

    const set_state = (name) => {
        el.state.innerHTML = `[${name}]`;
        el.state.className = `a runner-state ${STATE_CLASS[name] || ''}`;
        document.querySelector('#main-runner').setAttribute('state', name);
    };

    const current_state = () => {
        if (state.running) return 'running';
        let s = spim.state;
        if (s === 'ready' && state.paused) return 'paused';
        return s;
    };

    // ================== //
    //  Assemble          //
    // ================== //
    /**
     * Assembles the given (or active) file and loads it in the simulator
     *
     * @param {Object} file - Editor metadata (optional)
     * @param {Boolean} open - Open the [runner] group
     * @return {Boolean} - Assembled without errors
     */
    const assemble = (file = get_active(), open = true) => {
        stop(false);
        if (!file) {
            warning('No file opened. Open or create an .asm file first.');
            return false;
        }
        let route = file.route + file.name;
        return load_source(route, file.content, file, open);
    };

    const load_source = (route, content, file = null, open = true) => {
        stop(false);
        if (state.route !== route) spim.breakpoints.clear();

        let t0 = performance.now();
        let program = spim.load(content, route, { arch: state.arch });
        let ms = (performance.now() - t0).toFixed(1);

        state.file = file;
        state.route = route;
        state.source = content;
        state.paused = false;
        el.file.innerHTML = `[${escape(route)}]`;
        render_arch();

        clear_output();
        hide_input();

        program.warnings.forEach(w => log(`${route}:${w.line}: warning: ${w.message}`, 'warning'));

        if (file) {
            set_status(file, program.ok);
            mark_errors(file, program.errors);
        }

        HUB.emit('assemble', { route, ok: program.ok, program });
        if (!program.ok) {
            program.errors.forEach(e => log(`${route}:${e.line}: error: ${e.message}`, 'error'));
            log(`assemble failed: ${program.errors.length} error(s)`, 'error');
            warning(`${program.errors.length} error(s) in [${route}]. See [console].`);
            render_all();
            set_state('error');
            toggle_terminal(1, 'console');
            return false;
        }

        // Keep the breakpoints that still point to an instruction
        [...spim.breakpoints].forEach(a => { if (!spim.textAt(a)) spim.breakpoints.delete(a); });

        log(`${route} assembled in ${ms}ms: ${program.text.filter(t => !t.boot).length} instructions, ${program.dataBytes} bytes of data`, 'success');
        state.prev = spim.cpu.snapshot();
        state.prevMem.clear();
        render_text();
        render_all();
        set_state('ready');
        if (open) __group_h.open_group('runner');
        return true;
    };

    // ================== //
    //  Execution         //
    // ================== //
    const finished = () => {
        let s = spim.state;
        let cpu = spim.cpu;
        if (s === 'exited') {
            HUB.emit('exit', { code: cpu.exitCode, steps: cpu.steps, route: state.route });
            flush_output();
            log(`program exited with code ${cpu.exitCode} after ${cpu.steps} instructions`, 'success');
        } else if (s === 'error') {
            HUB.emit('error', { message: cpu.error, route: state.route });
            flush_output();
            let row = spim.textAt(cpu.pc);
            let where = row && row.line ? ` (${state.route}:${row.line})` : '';
            log(`${cpu.error}${where}`, 'error');
            output(`\n[error] ${cpu.error}\n`);
            toggle_terminal(1, 'console');
        } else if (s === 'input') {
            show_input();
        }
    };

    const tick = () => {
        state.timer = null;
        if (!state.running) return;

        let res = spim.run(CHUNK);

        if (res.state === 'ready' && !res.breakpoint) {
            el.state.title = `${spim.cpu.steps} instructions`;
            state.timer = setTimeout(tick, 0);
            return;
        }

        state.running = false;
        if (res.breakpoint !== undefined) {
            state.paused = true;
            log(`breakpoint at ${hex(res.breakpoint)}`, 'warning');
        }
        finished();
        render_all();
    };

    /**
     * Runs until a breakpoint, an input request or the end of the program
     */
    const run = (show_output = true) => {
        if (state.running) return;
        if (!spim.loaded) {
            if (!assemble()) return;
        } else if (spim.state === 'exited' || spim.state === 'error') {
            // Run again from the beginning
            spim.reset();
            clear_output();
        }
        if (spim.state === 'input') {
            show_input();
            return;
        }
        state.prev = spim.cpu.snapshot();
        state.running = true;
        state.paused = false;
        HUB.emit('run', { route: state.route });
        set_state('running');
        if (show_output) toggle_terminal(1, 'output');
        tick();
    };

    /**
     * Assembles the active file and runs it
     */
    const run_active = () => {
        if (assemble()) run();
    };

    /**
     * Executes one instruction
     */
    const step = () => {
        if (state.running) return;
        if (!spim.loaded) {
            assemble();
            return;
        }
        if (spim.state === 'input') {
            show_input();
            return;
        }
        if (spim.state === 'exited' || spim.state === 'error') {
            log(`program ${spim.state === 'exited' ? 'finished' : 'stopped'}, use [reset] to start again`, 'warning');
            return;
        }
        state.prev = spim.cpu.snapshot();
        state.paused = true;
        spim.runStep();
        HUB.emit('step', { pc: spim.pc });
        finished();
        render_all(true);
    };

    /**
     * Pauses the execution (kill process from the terminal)
     */
    const stop = (verbose = true) => {
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
        if (!state.running) return;
        state.running = false;
        state.paused = true;
        if (verbose) log(`paused at ${hex(spim.pc)} after ${spim.cpu.steps} instructions`, 'warning');
        render_all(true);
    };

    /**
     * Resets the machine: the loaded file is assembled again (with the current editor content)
     */
    const reset = () => {
        stop(false);
        if (state.file) return assemble(state.file, false);
        if (state.route) return load_source(state.route, state.source, null, false);
        set_state('idle');
        return false;
    };

    // ================== //
    //  Program input     //
    // ================== //
    const show_input = () => {
        set_state('input');
        el.inputKind.innerHTML = `[${spim.cpu.inputKind || 'stdin'}]`;
        el.inputBox.classList.add('active');
        toggle_terminal(1, 'output');
        flush_output();
        setTimeout(() => el.input.focus(), 0);
    };

    const hide_input = () => {
        el.inputBox.classList.remove('active');
        el.input.value = '';
    };

    el.input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (spim.state !== 'input') return;

        let value = el.input.value;
        output(value + '\n');
        hide_input();
        spim.provideInput(value);

        // Continue the execution where it was
        if (state.paused || !state.prev) {
            spim.runStep();
            finished();
            render_all(true);
        } else {
            state.running = true;
            set_state('running');
            tick();
        }
    });

    // ================== //
    //  Render: text      //
    // ================== //
    const render_text = () => {
        el.text.innerHTML = '';
        state.rows.clear();
        let program = spim.program;
        if (!program || !program.ok) {
            el.textInfo.innerHTML = '';
            return;
        }

        let frag = document.createDocumentFragment();
        program.text.forEach(t => {
            let tr = document.createElement('tr');
            if (t.boot) tr.classList.add('boot');
            if (t.segment === 'ktext') tr.classList.add('kernel');

            let td_bkpt = document.createElement('td');
            let check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = spim.breakpoints.has(t.addr);
            check.title = 'Breakpoint';
            check.addEventListener('change', () => {
                spim.toggleBreakpoint(t.addr, check.checked);
                tr.classList.toggle('bkpt', check.checked);
            });
            if (check.checked) tr.classList.add('bkpt');
            td_bkpt.appendChild(check);

            let source = t.source
                ? `<span class="muted">${t.boot ? '[startup]' : String(t.line).padStart(4, ' ') + ':'}</span> ${escape(t.source)}`
                : '';

            tr.appendChild(td_bkpt);
            tr.insertAdjacentHTML('beforeend', `<td>${hex(t.addr)}</td><td>${hex(t.word)}</td><td>${escape(t.basic)}</td><td>${source}</td>`);
            if (t.line) tr.title = `${state.route}:${t.line}`;

            state.rows.set(t.addr, tr);
            frag.appendChild(tr);
        });
        el.text.appendChild(frag);
        el.textInfo.innerHTML = `[${hex(program.textStart)} - ${hex(program.textEnd)}]`;
    };

    let pc_row = null;
    const render_pc = (scroll = false) => {
        if (pc_row) pc_row.classList.remove('pc-active', 'pc-error');
        pc_row = (spim.state !== 'exited' && state.rows.get(spim.pc)) || null;
        if (!pc_row) return;
        pc_row.classList.add('pc-active');
        if (spim.state === 'error') pc_row.classList.add('pc-error');
        if (scroll) scroll_into(pc_row, el.textMain);
    };

    const scroll_into = (row, container) => {
        // The table is clipped by its parent (the data segment is drawn over it)
        let r = row.getBoundingClientRect(), c = container.getBoundingClientRect();
        let bottom = Math.min(c.bottom, container.parentElement.getBoundingClientRect().bottom);
        let head = container.querySelector('thead')?.getBoundingClientRect().height || 0;
        if (r.top < c.top + head || r.bottom > bottom - 10) {
            container.scrollTop += r.top - c.top - head - (bottom - c.top) / 3;
        }
    };

    // ================== //
    //  Render: data      //
    // ================== //
    const sp_reg = () => spim.arch === 'riscv' ? 2 : 29;

    const segment_range = () => {
        let cpu = spim.cpu;
        let program = spim.program;
        let rows = (a, b) => [a & ~15, Math.max(b, (a & ~15) + 16 * 8)];
        switch (state.segment) {
            case 'heap': {
                let start = program ? (program.dataEnd + 7) & ~7 : 0x10010000;
                return rows(start, cpu.heap || start);
            }
            case 'stack': {
                let sp = (cpu.r[sp_reg()] >>> 0);
                let top = SPIM.SP_INIT + 4;
                if (sp > top || sp < 0x10000000) sp = top - 16 * 8;
                return [sp & ~15, Math.max(top, (sp & ~15) + 16 * 8)];
            }
            default: {
                let start = program ? program.dataStart : 0x10010000;
                return rows(start, program ? program.dataEnd : start);
            }
        }
    };

    const format_word = (w) => {
        if (state.ascii) {
            let s = '';
            for (let i = 0; i < 4; i++) {
                let c = (w >>> (8 * i)) & 0xff;
                s += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
            }
            return escape(s).replace(/ /g, '&nbsp;');
        }
        return state.format === 'dec' ? String(w | 0) : hex(w);
    };

    const render_data = () => {
        let [start, end] = segment_range();
        end = Math.min(end, start + 16 * MAX_ROWS);
        let sp = spim.cpu.r[sp_reg()] >>> 0;
        let html = '';
        let mem = new Map();
        for (let a = start; a < end; a += 16) {
            html += `<tr><td>${hex(a)}</td>`;
            for (let o = 0; o < 16; o += 4) {
                let w = spim.readWord(a + o);
                let cls = [];
                if (state.prevMem.has(a + o) && state.prevMem.get(a + o) !== w) cls.push('changed');
                if (state.segment === 'stack' && a + o === sp) cls.push('sp');
                mem.set(a + o, w);
                html += `<td class="${cls.join(' ')}">${format_word(w)}</td>`;
            }
            html += '</tr>';
        }
        el.data.innerHTML = html;
        state.prevMem = mem;
        el.dataInfo.innerHTML = `[${hex(start)} - ${hex(end)}]`;
    };

    // ================== //
    //  Render: registers //
    // ================== //
    const fmt = (v) => state.format === 'dec' ? String(v | 0) : hex(v);
    const changed = (a, b) => (state.prev && a !== b) ? ' class="changed"' : '';

    const render_registers = () => {
        let cpu = spim.cpu;
        let prev = state.prev || cpu.snapshot();
        let names = spim.registers;
        let riscv = cpu.arch === 'riscv';

        let html = '';
        for (let i = 0; i < 32; i++) {
            html += `<tr><td>[${names[i]}]</td><td>${riscv ? 'x' : '$'}${i}</td><td${changed(cpu.r[i], prev.r[i])}>${fmt(cpu.r[i])}</td></tr>`;
        }
        html += `<tr><td>[pc]</td><td></td><td>${hex(cpu.pc)}</td></tr>`;
        if (cpu.arch === 'mips') {
            html += `<tr><td>[hi]</td><td></td><td${changed(cpu.hi, prev.hi)}>${fmt(cpu.hi)}</td></tr>`;
            html += `<tr><td>[lo]</td><td></td><td${changed(cpu.lo, prev.lo)}>${fmt(cpu.lo)}</td></tr>`;
        }
        el.regs.innerHTML = html;
        if (cpu.arch !== 'mips') return;

        // Coprocessor 1
        html = '';
        for (let i = 0; i < 32; i++) {
            let single = state.format === 'dec' ? String(cpu.ff[i]) : hex(cpu.fi[i]);
            let double = '';
            if (i % 2 === 0) {
                double = state.format === 'dec'
                    ? String(cpu.fd[i >> 1])
                    : '0x' + (cpu.fi[i + 1] >>> 0).toString(16).padStart(8, '0') + (cpu.fi[i] >>> 0).toString(16).padStart(8, '0');
            }
            let ch = changed(cpu.fi[i], prev.f[i]);
            let chd = i % 2 === 0 ? changed(cpu.fi[i] + ':' + cpu.fi[i + 1], prev.f[i] + ':' + prev.f[i + 1]) : '';
            html += `<tr><td>[$f${i}]</td><td${ch}>${single}</td><td${chd}>${double}</td></tr>`;
        }
        html += `<tr><td>[fcc]</td><td${changed(cpu.fcc.join(''), prev.fcc.join(''))}>${Array.from(cpu.fcc).reverse().join('')}</td><td></td></tr>`;
        el.cop1.innerHTML = html;

        // Coprocessor 0
        html = '';
        [['vaddr', 8, 'badvaddr'], ['status', 12, 'status'], ['cause', 13, 'cause'], ['epc', 14, 'epc']].forEach(([label, n, key]) => {
            html += `<tr><td>[${label}]</td><td>$${n}</td><td${changed(cpu.cp0[key], prev.cp0[key])}>${hex(cpu.cp0[key])}</td></tr>`;
        });
        el.cop0.innerHTML = html;
    };

    // ================== //
    //  Architecture      //
    // ================== //
    const ARCH_LABEL = { auto: 'auto', mips: 'mips', riscv: 'risc-v' };

    // Badge of the loaded architecture + coprocessor tabs (MIPS only)
    const render_arch = () => {
        let arch = spim.program ? spim.arch : null;
        el.archBadge.innerHTML = arch ? `[${spim.archLabel}]` : '';
        el.archToggle.innerHTML = `[arch: ${ARCH_LABEL[state.arch]}]`;
        document.querySelector('#main-runner').setAttribute('arch', arch || state.arch);
        if (arch === 'riscv') __group_register.open_tab('register');
    };

    /**
     * Cycles the architecture used to assemble: auto (detected) -> mips -> risc-v
     */
    const set_arch = (mode: 'auto' | 'mips' | 'riscv', reload = true) => {
        state.arch = mode;
        render_arch();
        if (reload && state.route) reset();
    };

    const toggle_arch = () => {
        state.arch = state.arch === 'auto' ? 'mips' : state.arch === 'mips' ? 'riscv' : 'auto';
        log(`architecture: ${ARCH_LABEL[state.arch]}${state.arch === 'auto' ? ' (detected from the source)' : ''}`);
        render_arch();
        if (state.route) reset();
    };

    const render_all = (scroll = true) => {
        render_registers();
        render_data();
        render_pc(scroll);
        set_state(spim.loaded ? current_state() : (spim.program ? 'error' : 'idle'));
        // The [pipeline] view follows the execution
        if (typeof PIPELINE !== 'undefined' && PIPELINE) PIPELINE.refresh();
    };

    // ================== //
    //  HTML calls        //
    // ================== //
    const open_segment = (name) => {
        if (!['data', 'heap', 'stack'].includes(name)) return;
        state.segment = name;
        state.prevMem.clear();
        el.segmentTabs.forEach(t => t.classList.toggle('active', t.classList.contains(name)));
        render_data();
        el.dataMain.scrollTop = name === 'stack' ? 0 : el.dataMain.scrollTop;
    };

    const toggle_ascii = () => {
        state.ascii = !state.ascii;
        el.ascii.classList.toggle('active', state.ascii);
        render_data();
    };

    const toggle_format = () => {
        state.format = state.format === 'hex' ? 'dec' : 'hex';
        el.format.innerHTML = `[${state.format}]`;
        render_registers();
        render_data();
    };

    const scroll_pc = () => {
        __group_h.open_group('runner');
        render_pc(true);
    };

    const show_breakpoints = () => {
        let list = [...spim.breakpoints].sort((a, b) => a - b);
        if (!list.length) log('no breakpoints. Check the [bkpt] column of the text segment to add one');
        list.forEach(a => {
            let t = spim.textAt(a);
            log(`breakpoint ${hex(a)}${t && t.line ? `  ${state.route}:${t.line}  ${t.source || t.basic}` : ''}`);
        });
        toggle_terminal(1, 'console');
    };

    const download_logs = () => {
        let text = `SpimHub logs - ${new Date().toISOString()}\n\n[console]\n${state.logs.join('\n')}\n\n[output]\n${el.output.textContent}\n`;
        saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'spimhub-logs.txt');
    };

    // Initial (empty) tables
    render_arch();
    render_all(false);
    set_state('idle');

    RUNNER = {
        spim,
        assemble, load_source, run, run_active, step, stop, reset,
        open_segment, toggle_ascii, toggle_format, scroll_pc, show_breakpoints, download_logs, toggle_arch, set_arch,
        log, output, clear_output, get_active,
        get route() { return state.route; },
        get arch_mode() { return state.arch; },
        get running() { return state.running; },
    };
});
