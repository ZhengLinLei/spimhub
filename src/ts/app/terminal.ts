/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/js/terminal.js

    [terminal] commands over the virtual filesystem (FSPath-1.0) and the
    simulator (RUNNER). Type `help` in the terminal.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

window.addEventListener('load', () => {

    const hex = SPIM.hex;
    const log_el = TERMINAL.main.querySelector('.terminal-log');
    const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    TERMINAL.cwd = '/';
    TERMINAL.history = [];
    TERMINAL.config.history = 0;

    // ================== //
    //  Output            //
    // ================== //
    /**
     * Prints a line in the terminal
     *
     * @param {String} text
     * @param {String} cls - css class (muted, text-error, text-success...)
     * @param {Boolean} html - text is already html
     */
    TERMINAL.print = (text = '', cls = '', html = false) => {
        let line = document.createElement('div');
        if (cls) line.className = cls;
        line.innerHTML = html ? text : escape(text);
        log_el.appendChild(line);
        TERMINAL.main.scrollTop = TERMINAL.main.scrollHeight;
    };
    const print = TERMINAL.print;
    const error = (text) => print(text, 'text-error');

    TERMINAL.clear = () => { log_el.innerHTML = ''; };

    TERMINAL.copy = () => {
        let sel = String(window.getSelection());
        COPY_CLIPBOARD(sel || log_el.innerText);
    };

    TERMINAL.paste = () => {
        navigator.clipboard.readText().then(text => {
            text = text.replace(/\r?\n/g, ' ');
            let cur = TERMINAL.input.innerText, pos = TERMINAL.config.position;
            TERMINAL.input.innerText = cur.slice(0, pos) + text + cur.slice(pos);
            TERMINAL.config.position = pos + text.length;
            TERMINAL.move_caret();
        }).catch(() => error('paste: clipboard permission denied'));
        TERMINAL.main.focus();
    };

    TERMINAL.select_all = () => {
        let range = document.createRange();
        range.selectNodeContents(log_el);
        let sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const set_cwd = (dir) => {
        TERMINAL.cwd = dir;
        TERMINAL.import.route.innerText = dir;
    };

    // ================== //
    //  History           //
    // ================== //
    TERMINAL.history_move = (dir) => {
        let h = TERMINAL.history;
        let cfg = TERMINAL.config;
        cfg.history = Math.max(0, Math.min(h.length, cfg.history + dir));
        let cmd = cfg.history === 0 ? '' : h[h.length - cfg.history];
        TERMINAL.input.innerText = cmd;
        cfg.position = cmd.length;
    };

    // ================== //
    //  Paths             //
    // ================== //
    /**
     * Resolves a path against the current directory
     *
     * @return {String} - Absolute route (folders end with '/')
     */
    const resolve = (path = '', folder = false) => {
        let abs = path.startsWith('/') ? path : TERMINAL.cwd + path;
        let parts = [];
        abs.split('/').forEach(p => {
            if (p === '' || p === '.') return;
            if (p === '..') parts.pop();
            else parts.push(p);
        });
        let route = '/' + parts.join('/');
        if (folder && route !== '/') route += '/';
        return route;
    };

    const find_file = (path) => {
        if (!path) return null;
        let route = resolve(path);
        let candidates = [route, route.endsWith('.asm') ? null : route + '.asm'].filter(Boolean);
        for (let r of candidates) {
            let name = r.split('/').pop();
            let dir = r.slice(0, r.length - name.length);
            let file = ((FILE_SYSTEM[dir] || {}).files || {})[name];
            if (file) return file;
        }
        return null;
    };

    // Editor metadata of a file (if opened, it may have unsaved changes)
    const opened = (file) => {
        for (let w of Object.values(WINDOW_EDITOR.files)) {
            let f = w.find(m => m.route + m.name === file.route + file.name);
            if (f) return f;
        }
        return null;
    };

    // ================== //
    //  Commands          //
    // ================== //
    const COMMANDS: Record<string, { args?: string; desc: string; fn: (args: string[]) => void }> = {
        help: {
            desc: 'show this help',
            fn: () => {
                print(T('SpimHub terminal. Available commands:'), 'muted');
                Object.entries(COMMANDS).forEach(([name, c]) => {
                    print(`<span class="__f_keywords">${escape((name + ' ' + (c.args || '')).padEnd(22))}</span> ${escape(T(c.desc))}`, '', true);
                });
                print('');
                print(T('Shortcuts: F5 run · F10 step · Alt+Shift+R run active file · Ctrl+C pause · ↑↓ history · Tab complete'), 'muted');
            },
        },
        clear: { desc: 'clear the terminal', fn: () => TERMINAL.clear() },
        pwd: { desc: 'print the current folder', fn: () => print(TERMINAL.cwd) },
        ls: {
            args: '[folder]',
            desc: 'list a folder',
            fn: ([path]) => {
                let dir = resolve(path || '', true);
                let folder = FILE_SYSTEM[dir];
                if (!folder) return error(`ls: ${dir}: no such folder`);
                let out = [
                    ...folder.folders.filter(Boolean).sort().map(f => `<span class="__f_builtin">[${escape(f)}]</span>`),
                    ...Object.keys(folder.files).sort().map(escape),
                ];
                print(out.join('  ') || '<span class="muted">(empty)</span>', '', true);
            },
        },
        tree: {
            args: '[folder]',
            desc: 'show the project tree',
            fn: ([path]) => {
                let dir = resolve(path || '', true);
                if (!FILE_SYSTEM[dir]) return error(`tree: ${dir}: no such folder`);
                let walk = (d, prefix) => {
                    let f = FILE_SYSTEM[d];
                    let items = [...f.folders.filter(Boolean).sort().map(n => [n, true]), ...Object.keys(f.files).sort().map(n => [n, false])];
                    items.forEach(([name, isDir], i) => {
                        let last = i === items.length - 1;
                        print(`${prefix}${last ? '└── ' : '├── '}${isDir ? `[${name}]` : name}`);
                        if (isDir) walk(`${d}${name}/`, prefix + (last ? '    ' : '│   '));
                    });
                };
                print(dir);
                walk(dir, '');
            },
        },
        cd: {
            args: '<folder>',
            desc: 'change the current folder',
            fn: ([path]) => {
                let dir = resolve(path || '/', true);
                if (!FILE_SYSTEM[dir]) return error(`cd: ${dir}: no such folder`);
                set_cwd(dir);
            },
        },
        cat: {
            args: '<file>',
            desc: 'print a file',
            fn: ([path]) => {
                let file = find_file(path);
                if (!file) return error(`cat: ${path || ''}: no such file`);
                let meta = opened(file);
                print((meta ? meta.content : file.content) || '', '');
            },
        },
        open: {
            args: '<file>',
            desc: 'open a file in the editor',
            fn: ([path]) => {
                let file = find_file(path);
                if (!file) return error(`open: ${path || ''}: no such file`);
                open_file(file);
            },
        },
        touch: {
            args: '<file>',
            desc: 'create a new .asm file',
            fn: ([name]) => {
                if (!name) return error('touch: missing file name');
                if (!name.endsWith('.asm')) name += '.asm';
                if (!__new_file(name, TERMINAL.cwd)) error(`touch: cannot create ${name}`);
            },
        },
        mkdir: {
            args: '<folder>',
            desc: 'create a folder',
            fn: ([name]) => {
                if (!name || !/^[\w\-.]+$/.test(name)) return error('mkdir: invalid folder name');
                if (!__new_folder(name, TERMINAL.cwd)) error(`mkdir: cannot create ${name}`);
            },
        },
        run: {
            args: '[file]',
            desc: 'assemble and run a file (default: active file)',
            fn: ([path]) => load(path) && RUNNER.run(),
        },
        spim: {
            args: '[-file] <file>',
            desc: 'same as run (spim compatibility)',
            fn: (args) => COMMANDS.run.fn(args.filter(a => a !== '-file' && a !== '-f')),
        },
        asm: {
            args: '[file]',
            desc: 'assemble a file without running it',
            fn: ([path]) => load(path),
        },
        step: {
            args: '[n]',
            desc: 'execute n instructions (default 1)',
            fn: ([arg]) => {
                let n = Math.max(1, parseInt(arg || '1', 10) || 1);
                for (let i = 0; i < n && !RUNNER.running && RUNNER.spim.state === 'ready'; i++) RUNNER.step();
                let t = RUNNER.spim.textAt(RUNNER.spim.pc);
                print(`pc = ${hex(RUNNER.spim.pc)}${t ? `  ${t.basic}` : ''}`, 'muted');
            },
        },
        continue: { desc: 'continue the execution', fn: () => RUNNER.run() },
        pause: { desc: 'pause the execution (Ctrl + C)', fn: () => RUNNER.stop() },
        reset: { desc: 'reset registers and memory', fn: () => RUNNER.reset() },
        reg: {
            args: '[reg ...]',
            desc: 'print registers',
            fn: (names) => {
                let spim = RUNNER.spim;
                let cpu = spim.cpu;
                let all = spim.registers;
                if (!names.length) {
                    for (let i = 0; i < 32; i += 4) {
                        print([0, 1, 2, 3].map(k => `${all[i + k].padEnd(6)} ${hex(cpu.r[i + k])}`).join('   '));
                    }
                    print(`pc     ${hex(cpu.pc)}` + (cpu.arch === 'mips' ? `   hi     ${hex(cpu.hi)}   lo     ${hex(cpu.lo)}` : ''));
                    return;
                }
                names.forEach(n => {
                    let key = n.replace(/^\$/, '').toLowerCase();
                    if (key === 'pc') return print(`pc = ${hex(cpu.pc)}`);
                    if (cpu.arch === 'mips') {
                        if (key === 'hi' || key === 'lo') return print(`${key} = ${hex(cpu[key])}`);
                        if (/^f\d+$/.test(key) && +key.slice(1) < 32) return print(`$${key} = ${hex(cpu.fi[+key.slice(1)])} (${cpu.ff[+key.slice(1)]})`);
                    }
                    let table: Record<string, number> = cpu.arch === 'mips' ? SPIM.ISA.GPR : SPIM.RISCV.XREG;
                    let i = table[key];
                    if (i === undefined) return error(`reg: unknown register ${n}`);
                    print(`${all[i]} = ${hex(cpu.r[i])} (${cpu.r[i]})`);
                });
            },
        },
        mem: {
            args: '<addr|label> [words]',
            desc: 'print memory words',
            fn: ([addr, count]) => {
                if (!addr) return error('mem: missing address');
                let symbols = (RUNNER.spim.program || {}).symbols || {};
                let a = addr in symbols ? symbols[addr] : Number(addr);
                if (!Number.isFinite(a)) return error(`mem: invalid address ${addr}`);
                a = (a >>> 0) & ~3;
                let n = Math.min(256, Math.max(1, parseInt(count || '8', 10) || 8));
                for (let i = 0; i < n; i += 4) {
                    let words = [];
                    for (let k = 0; k < 4 && i + k < n; k++) words.push(hex(RUNNER.spim.readWord(a + 4 * (i + k))));
                    print(`${hex(a + 4 * i)}  ${words.join('  ')}`);
                }
            },
        },
        bkpt: {
            args: '[addr|label]',
            desc: 'toggle a breakpoint / list them',
            fn: ([addr]) => {
                if (!addr) return RUNNER.show_breakpoints();
                let symbols = (RUNNER.spim.program || {}).symbols || {};
                let a = addr in symbols ? symbols[addr] : Number(addr);
                if (!RUNNER.spim.textAt(a)) return error(`bkpt: ${addr} is not an instruction address`);
                let on = RUNNER.spim.toggleBreakpoint(a);
                print(`breakpoint ${hex(a)} ${on ? 'set' : 'removed'}`);
                document.querySelectorAll('#text-segment tr').forEach(tr => {
                    if (tr.children[1] && (tr.children[1] as HTMLElement).innerText === hex(a)) {
                        tr.querySelector('input').checked = on;
                        tr.classList.toggle('bkpt', on);
                    }
                });
            },
        },
        symbols: {
            desc: 'print the symbol table',
            fn: () => {
                let symbols = (RUNNER.spim.program || {}).symbols;
                if (!symbols) return error('symbols: no program loaded');
                Object.entries(symbols).sort((a, b) => a[1] - b[1]).forEach(([n, a]) => print(`${hex(a)}  ${n}`));
            },
        },
        pipeline: {
            args: '[forwarding on|off] [branch id|ex]',
            desc: 'open the pipeline view / change its options',
            fn: (args) => {
                let spim = RUNNER.spim;
                for (let i = 0; i < args.length; i += 2) {
                    let [key, value] = [args[i], (args[i + 1] || '').toLowerCase()];
                    if (key === 'forwarding' && (value === 'on' || value === 'off')) spim.setPipelineOptions({ forwarding: value === 'on' });
                    else if (key === 'branch' && (value === 'id' || value === 'ex')) spim.setPipelineOptions({ branchStage: value === 'id' ? 'ID' : 'EX' });
                    else return error(`pipeline: unknown option "${args.slice(i, i + 2).join(' ')}"`);
                }
                let st = spim.pipeline.stats();
                let o = spim.pipeline.options;
                print(`forwarding ${o.forwarding ? 'on' : 'off'}, branches in ${o.branchStage}`);
                print(`${st.instructions} instructions, ${st.cycles} cycles, CPI ${st.cpi.toFixed(2)}, ${st.stalls} stalls, ${st.flushes} flushes, ${st.forwards} forwards`);
                PIPELINE.open();
            },
        },
        theme: {
            args: '[light|dark]',
            desc: 'change the theme',
            fn: ([t]) => set_theme(t || 'toggle'),
        },
        echo: { args: '<text>', desc: 'print text', fn: (args) => print(args.join(' ')) },
        history: { desc: 'show the command history', fn: () => TERMINAL.history.forEach((c, i) => print(`${String(i + 1).padStart(4)}  ${c}`)) },
        version: { desc: 'print the version', fn: () => print(`SpimHub ${SPIM.VERSION} · MIPS32 / RV32IM assembler, simulator & pipeline`) },
    };

    /**
     * Adds a command (used by the extensions). Returns a function that removes it.
     */
    TERMINAL.register = (name: string, cmd: { args?: string; desc: string; fn: (args: string[]) => void }) => {
        name = String(name).toLowerCase();
        if (!/^[a-z][\w-]*$/.test(name)) throw new Error(`invalid command name "${name}"`);
        if (COMMANDS[name]) throw new Error(`the command "${name}" already exists`);
        COMMANDS[name] = cmd;
        return () => { if (COMMANDS[name] === cmd) delete COMMANDS[name]; };
    };

    // Assemble a file of the virtual filesystem (or the active one)
    const load = (path) => {
        if (!path) {
            if (!RUNNER.get_active()) { error('run: no active file, use run <file>'); return false; }
            return RUNNER.assemble(undefined, true);
        }
        let file = find_file(path);
        if (!file) { error(`${path}: no such file`); return false; }
        let meta = opened(file);
        let ok = meta ? RUNNER.assemble(meta, true) : RUNNER.load_source(file.route + file.name, file.content, null, true);
        print(ok ? `${file.route}${file.name} assembled` : `${file.route}${file.name}: errors, see [console]`, ok ? 'muted' : 'text-error');
        return ok;
    };

    // ================== //
    //  Execute           //
    // ================== //
    /**
     * Executes a command line
     */
    TERMINAL.exec = (line) => {
        print(`<span class="__f_builtin terminal-name">${escape(NAVIGATOR_NAME)}@${escape(TERMINAL.cwd)} ~ %</span> ${escape(line)}`, '', true);
        line = line.trim();
        if (!line) return;

        TERMINAL.history.push(line);
        TERMINAL.config.history = 0;

        let args = line.match(/"[^"]*"|\S+/g).map(a => a.replace(/^"(.*)"$/, '$1'));
        let name = args.shift().toLowerCase();
        let cmd = COMMANDS[name];
        if (!cmd) return error(`${name}: command not found. Type "help"`);
        try {
            cmd.fn(args);
        } catch (e) {
            error(`${name}: ${e.message}`);
            console.error(e);
        }
    };

    // Autocomplete commands and files
    TERMINAL.complete = () => {
        let text = TERMINAL.input.innerText;
        let parts = text.split(' ');
        let last = parts.pop();
        let options;
        if (!parts.length) {
            options = Object.keys(COMMANDS).filter(c => c.startsWith(last));
        } else {
            let slash = last.lastIndexOf('/');
            let dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
            let dir = resolve(dirPart, true);
            let folder = FILE_SYSTEM[dir];
            if (!folder) return;
            let base = last.slice(slash + 1);
            options = [...folder.folders.filter(Boolean).map(f => f + '/'), ...Object.keys(folder.files)]
                .filter(n => n.startsWith(base)).map(n => dirPart + n);
        }
        if (options.length === 1) {
            TERMINAL.set_input([...parts, options[0]].join(' ') + (options[0].endsWith('/') ? '' : ' '));
        } else if (options.length > 1) {
            print(options.join('  '), 'muted');
        }
    };

    print(`SpimHub ${SPIM.VERSION} terminal. Type "help" to see the commands.`, 'muted');
});
