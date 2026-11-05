/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/ux.ts

    Shared UX pieces:
        HUB        event bus (used by the runner, the editor and the extensions)
        NOTIFY     toasts            NOTIFY('saved', 'success')
        CONFIRM    modal             if (await CONFIRM('Delete?')) ...
        UX         status bar, command palette, go to line, editing keys
        COMMANDS   command registry (palette + extensions)

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

// ================== //
//  Event bus         //
// ================== //
/*
    Events:
        ready                       every script and extension is loaded
        assemble  { route, ok, program }
        run       { route }
        step      { pc }
        exit      { code, steps }
        error     { message }
        output    text
        file-open { route, name }
        file-save { route, name }
        theme     'light' | 'dark'
*/
type HubListener = (data?: any) => void;
const HUB = (() => {
    const listeners = new Map<string, Set<HubListener>>();
    return {
        on(event: string, fn: HubListener) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(fn);
            return () => HUB.off(event, fn);
        },
        off(event: string, fn: HubListener) {
            listeners.get(event)?.delete(fn);
        },
        emit(event: string, data?: any) {
            listeners.get(event)?.forEach(fn => {
                try { fn(data); } catch (e) { console.error(`[spimhub] "${event}" listener:`, e); }
            });
        },
    };
})();

// ================== //
//  Commands          //
// ================== //
interface Command {
    id: string;
    title: string;
    keys?: string;
    run: () => void;
    source?: string;            // Extension id
}
const COMMANDS = new Map<string, Command>();
const COMMAND = (c: Command) => { COMMANDS.set(c.id, c); return () => COMMANDS.delete(c.id); };

// ================== //
//  Toasts            //
// ================== //
type NotifyType = 'info' | 'success' | 'warning' | 'error';
const NOTIFY = (message: string, type: NotifyType = 'info', timeout = 4000): HTMLElement => {
    const box = document.querySelector('#toasts');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    t.addEventListener('click', () => t.remove());
    box.appendChild(t);
    // Keep a few toasts only
    while (box.children.length > 4) box.firstElementChild.remove();
    if (timeout > 0) setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, timeout);
    return t;
};

// ================== //
//  Confirm modal     //
// ================== //
const CONFIRM = (message: string, options: { title?: string; ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> => {
    const el = document.querySelector<HTMLElement>('#confirm');
    const ok = el.querySelector<HTMLElement>('.confirm-ok');
    const cancel = el.querySelector<HTMLElement>('.confirm-cancel');
    el.querySelector('.confirm-title').textContent = `[${options.title || 'confirm'}]`;
    el.querySelector('.confirm-text').textContent = message;
    ok.textContent = `[${options.ok || 'ok'}]`;
    cancel.textContent = `[${options.cancel || 'cancel'}]`;
    ok.classList.toggle('bg-error', !!options.danger);
    ok.classList.toggle('bg-success', !options.danger);
    UX.modal(el);
    return new Promise(resolve => {
        const done = (v: boolean) => {
            UX.close_modal();
            document.removeEventListener('keydown', keys, true);
            resolve(v);
        };
        const keys = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        };
        ok.onclick = () => done(true);
        cancel.onclick = () => done(false);
        UX.on_modal_close = () => done(false);
        document.addEventListener('keydown', keys, true);
    });
};

// ================== //
//  UX                //
// ================== //
interface UXApi {
    modal(el: HTMLElement): void;
    close_modal(): void;
    on_modal_close: (() => void) | null;
    palette(prefix?: string): void;
    goto_line(): void;
    toggle_comment(): void;
    edit_keys(textarea: HTMLTextAreaElement, e: KeyboardEvent): boolean;
    status(): void;
    status_item(text: string, onclick?: () => void, title?: string): { set(text: string): void; remove(): void };
    active_textarea(): HTMLTextAreaElement | null;
    insert(textarea: HTMLTextAreaElement, text: string, start?: number, end?: number): void;
    reveal(textarea: HTMLTextAreaElement, start: number, end?: number, focus?: boolean): void;
}

let UX: UXApi;

window.addEventListener('load', () => {

    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const escape = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isMac = document.documentElement.getAttribute('pc') === 'mac';
    const mod = isMac ? '⌘' : 'Ctrl';

    // ---------------- Modals ----------------
    let open_modal: HTMLElement | null = null;
    const layer = $('#clicker-changer');

    const modal = (el: HTMLElement) => {
        if (open_modal && open_modal !== el) close_modal();
        open_modal = el;
        el.classList.add('active');
        layer.classList.add('active');
    };
    const close_modal = () => {
        if (!open_modal) return;
        const el = open_modal;
        open_modal = null;
        el.classList.remove('active');
        layer.classList.remove('active');
        const cb = UX.on_modal_close;
        UX.on_modal_close = null;
        if (cb) cb();
    };
    layer.addEventListener('click', () => close_modal());

    // ---------------- Editor helpers ----------------
    const active_file = (): EditorFile | null => {
        if (typeof RUNNER !== 'undefined' && RUNNER) return RUNNER.get_active();
        return null;
    };
    const active_textarea = () => {
        const f = active_file();
        return f ? f.__f.querySelector('textarea') : null;
    };

    /**
     * Replaces [start, end) with `text` keeping the native undo stack
     */
    const insert = (ta: HTMLTextAreaElement, text: string, start = ta.selectionStart, end = ta.selectionEnd) => {
        ta.focus();
        ta.setSelectionRange(start, end);
        if (!document.execCommand('insertText', false, text)) {
            ta.setRangeText(text, start, end, 'end');
            ta.dispatchEvent(new Event('input'));
        }
    };

    /**
     * Selects a range of the textarea and scrolls it into the middle of the view
     */
    const reveal = (ta: HTMLTextAreaElement, start: number, end = start, focus = true) => {
        const line = ta.value.slice(0, start).split('\n').length - 1;
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 14.4;
        const target = line * lh - ta.clientHeight / 3;
        if (line * lh < ta.scrollTop + lh || line * lh > ta.scrollTop + ta.clientHeight - 3 * lh) {
            ta.scrollTop = Math.max(0, target);
        }
        if (focus) ta.focus();
        ta.setSelectionRange(start, end);
        ta.dispatchEvent(new Event('scroll'));
        if (focus) focus_line(ta);
        status();
    };

    // ---------------- Editing keys ----------------
    const line_bounds = (ta: HTMLTextAreaElement) => {
        const v = ta.value;
        const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        let end = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), ta.selectionStart));
        if (end === -1) end = v.length;
        return [start, end];
    };

    // Applies `fn` to every selected line and keeps the lines selected
    const map_lines = (ta: HTMLTextAreaElement, fn: (line: string) => string) => {
        const [start, end] = line_bounds(ta);
        const lines = ta.value.slice(start, end).split('\n');
        const text = lines.map(fn).join('\n');
        insert(ta, text, start, end);
        ta.setSelectionRange(start, start + text.length);
    };

    const toggle_comment = (ta = active_textarea()) => {
        if (!ta) return;
        const [start, end] = line_bounds(ta);
        const lines = ta.value.slice(start, end).split('\n');
        const code = lines.filter(l => l.trim());
        const commented = code.length && code.every(l => /^\s*#/.test(l));
        map_lines(ta, l => {
            if (!l.trim()) return l;
            return commented ? l.replace(/^(\s*)# ?/, '$1') : l.replace(/^(\s*)/, '$1# ');
        });
    };

    /**
     * Editing keys of the code editor. Returns true if the key was handled.
     *      Tab / Shift + Tab     indent / outdent (selected lines)
     *      Enter                 keep the indentation of the line
     *      Ctrl + /              toggle # comment
     */
    const edit_keys = (ta: HTMLTextAreaElement, e: KeyboardEvent): boolean => {
        const tab = ' '.repeat(TAB_SIZE);
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n');
            if (e.shiftKey) map_lines(ta, l => l.startsWith(tab) ? l.slice(TAB_SIZE) : l.replace(/^ +/, ''));
            else if (multi) map_lines(ta, l => tab + l);
            else insert(ta, tab);
            return true;
        }
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            const v = ta.value;
            const lineStart = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
            const line = v.slice(lineStart, ta.selectionStart);
            let indent = /^\s*/.exec(line)[0];
            // After a label ("loop:") the code is indented
            if (!indent && /^[A-Za-z_.][\w.$]*:\s*(#.*)?$/.test(line.trim())) indent = tab;
            insert(ta, '\n' + indent);
            return true;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
            toggle_comment(ta);
            return true;
        }
        return false;
    };

    // ---------------- Status bar ----------------
    const sb = {
        arch: $('#status-bar .sb-arch'),
        file: $('#status-bar .sb-file'),
        saved: $('#status-bar .sb-saved'),
        state: $('#status-bar .sb-state'),
        pos: $('#status-bar .sb-pos'),
        tab: $('#status-bar .sb-tab'),
        ext: $('#status-bar .sb-ext'),
    };

    const status = () => {
        const f = active_file();
        const ta = f ? f.__f.querySelector('textarea') : null;
        sb.file.textContent = f ? `${f.route}${f.name}` : '';
        sb.saved.textContent = f ? (f.__fw.classList.contains('not-saved') ? '● unsaved' : 'saved') : '';
        sb.saved.classList.toggle('text-warning-strong', !!f && f.__fw.classList.contains('not-saved'));
        if (ta) {
            const before = ta.value.slice(0, ta.selectionStart).split('\n');
            const sel = ta.selectionEnd - ta.selectionStart;
            sb.pos.textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}${sel ? ` (${sel} selected)` : ''}`;
        } else sb.pos.textContent = '';
        sb.tab.textContent = `spaces: ${TAB_SIZE}`;
        if (typeof RUNNER !== 'undefined' && RUNNER) {
            const spim = RUNNER.spim;
            const mode = RUNNER.arch_mode;
            const arch = mode === 'auto'
                ? (ta ? SPIM.detectArch(ta.value) : null)
                : mode;
            sb.arch.textContent = `[${arch === 'riscv' ? 'RISC-V' : arch === 'mips' ? 'MIPS' : 'auto'}${mode === 'auto' && arch ? ' · auto' : ''}]`;
            sb.state.textContent = document.querySelector('#main-runner .runner-state')?.textContent || '';
            sb.state.className = `sb-state ${document.querySelector('#main-runner .runner-state')?.className.replace(/\b(a|runner-state)\b/g, '') || ''}`;
            void spim;
        }
    };
    let status_timer: ReturnType<typeof setTimeout> | null = null;
    const status_soon = () => {
        if (status_timer) return;
        status_timer = setTimeout(() => { status_timer = null; status(); }, 60);
    };
    ['keyup', 'click', 'input', 'focusin', 'mouseup'].forEach(ev => document.addEventListener(ev, status_soon, true));
    ['file-open', 'file-save', 'assemble'].forEach(ev => HUB.on(ev, status_soon));
    const observer = new MutationObserver(status_soon);
    observer.observe(document.querySelector('#main-runner .runner-state'), { childList: true, attributes: true });

    const status_item = (text: string, onclick?: () => void, title = '') => {
        const a = document.createElement(onclick ? 'a' : 'span');
        a.textContent = text;
        if (title) a.title = title;
        if (onclick) a.addEventListener('click', onclick);
        sb.ext.appendChild(a);
        return { set: (t: string) => { a.textContent = t; }, remove: () => a.remove() };
    };

    // ---------------- Command palette ----------------
    const palette_el = $('#palette');
    const palette_input = palette_el.querySelector<HTMLInputElement>('.palette-input');
    const palette_list = palette_el.querySelector('.palette-list');
    let palette_items: { title: string; hint?: string; run: () => void }[] = [];
    let palette_index = 0;
    let palette_mode: 'commands' | 'line' = 'commands';

    // Fuzzy: every char of the query in order
    const fuzzy = (q: string, text: string): number => {
        q = q.toLowerCase(); text = text.toLowerCase();
        if (!q) return 1;
        const i = text.indexOf(q);
        if (i >= 0) return 100 - i;
        let p = 0;
        for (const c of text) if (c === q[p]) p++;
        return p === q.length ? 10 : 0;
    };

    const example_items = () => {
        const out: { title: string; hint: string; run: () => void }[] = [];
        Object.keys(FILE_SYSTEM).forEach(route => {
            Object.values(FILE_SYSTEM[route].files).forEach(file => {
                out.push({ title: `open ${route}${file.name}`, hint: 'file', run: () => open_file(file) });
            });
        });
        return out;
    };

    const render_palette = () => {
        const q = palette_input.value;
        if (palette_mode === 'line') {
            const n = parseInt(q.replace(/^:/, ''), 10);
            palette_items = [{ title: Number.isFinite(n) ? `go to line ${n}` : 'type a line number', run: () => goto(n) }];
        } else {
            const all = [
                ...[...COMMANDS.values()].map(c => ({ title: c.title, hint: c.keys || (c.source ? `[${c.source}]` : ''), run: c.run })),
                ...(q.length > 1 ? example_items() : []),
            ];
            palette_items = all
                .map(it => ({ it, score: fuzzy(q, it.title) }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 30)
                .map(x => x.it);
        }
        palette_index = Math.min(palette_index, Math.max(0, palette_items.length - 1));
        palette_list.innerHTML = palette_items.map((it, i) =>
            `<li class="${i === palette_index ? 'active' : ''}" data-i="${i}"><span>${escape(it.title)}</span><span class="muted">${escape((it as { hint?: string }).hint || '')}</span></li>`).join('')
            || '<li class="muted">no commands</li>';
        palette_list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    };

    const run_palette = (i = palette_index) => {
        const it = palette_items[i];
        close_modal();
        if (it) setTimeout(() => it.run(), 0);
    };

    const palette = (prefix = '') => {
        palette_mode = prefix === ':' ? 'line' : 'commands';
        palette_input.placeholder = palette_mode === 'line' ? 'line number' : 'type a command, or a file name';
        palette_input.value = '';
        palette_index = 0;
        modal(palette_el);
        render_palette();
        setTimeout(() => palette_input.focus(), 0);
    };

    palette_input.addEventListener('input', () => { palette_index = 0; render_palette(); });
    palette_input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); palette_index = Math.min(palette_index + 1, palette_items.length - 1); render_palette(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); palette_index = Math.max(palette_index - 1, 0); render_palette(); }
        else if (e.key === 'Enter') { e.preventDefault(); run_palette(); }
        else if (e.key === 'Escape') { e.preventDefault(); close_modal(); }
    });
    palette_list.addEventListener('click', (e) => {
        const li = (e.target as Element).closest('li[data-i]');
        if (li) run_palette(+li.getAttribute('data-i'));
    });

    // ---------------- Go to line ----------------
    const goto = (n: number) => {
        const ta = active_textarea();
        if (!ta || !Number.isFinite(n)) return;
        const lines = ta.value.split('\n');
        n = Math.max(1, Math.min(n, lines.length));
        const pos = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
        __group_h.open_group('editor');
        reveal(ta, pos, pos);
    };

    UX = {
        modal, close_modal, on_modal_close: null,
        palette, goto_line: () => palette(':'),
        toggle_comment: () => toggle_comment(),
        edit_keys, status, status_item, active_textarea, insert, reveal,
    };

    // ---------------- Built-in commands ----------------
    [
        { id: 'file.new', title: 'new file', keys: 'Alt + N', run: () => __pop_up._save('file') },
        { id: 'file.folder', title: 'new folder', keys: 'Alt + M', run: () => __pop_up._save('folder') },
        { id: 'file.save', title: 'save file', keys: `${mod} + S`, run: () => html_save('file') },
        { id: 'file.saveall', title: 'save all files', keys: 'Alt + A', run: () => html_save('all') },
        { id: 'file.closeall', title: 'close all files', run: () => html_close_all() },
        { id: 'project.download', title: 'download project (.spim)', keys: 'Alt + X', run: () => download_project() },
        { id: 'project.open', title: 'open project (.spim)', keys: 'Alt + Z', run: () => __pop_up._open_project() },
        { id: 'edit.find', title: 'find in file', keys: `${mod} + F`, run: () => FINDER.open() },
        { id: 'edit.replace', title: 'replace in file', keys: 'Alt + F', run: () => FINDER.open(true) },
        { id: 'edit.search', title: 'search in all files', keys: `${mod} + Shift + F`, run: () => SEARCH.open() },
        { id: 'edit.goto', title: 'go to line', keys: `${mod} + G`, run: () => palette(':') },
        { id: 'edit.comment', title: 'toggle comment', keys: `${mod} + /`, run: () => toggle_comment() },
        { id: 'run.assemble', title: 'assemble active file', keys: 'Alt + Shift + A', run: () => RUNNER.assemble() },
        { id: 'run.run', title: 'run active file', keys: 'Alt + Shift + R', run: () => RUNNER.run_active() },
        { id: 'run.step', title: 'run step', keys: 'F10', run: () => RUNNER.step() },
        { id: 'run.reset', title: 'reset the simulator', run: () => RUNNER.reset() },
        { id: 'run.arch', title: 'change architecture (auto / mips / risc-v)', run: () => RUNNER.toggle_arch() },
        { id: 'view.editor', title: 'open editor', keys: 'Alt + E', run: () => __group_h.open_group('editor') },
        { id: 'view.runner', title: 'open runner', keys: 'Alt + R', run: () => __group_h.open_group('runner') },
        { id: 'view.pipeline', title: 'open pipeline', keys: 'Alt + L', run: () => PIPELINE.open() },
        { id: 'pipeline.forwarding', title: 'pipeline: toggle forwarding', run: () => PIPELINE.toggle_forwarding() },
        { id: 'pipeline.branch', title: 'pipeline: branches in ID / EX', run: () => PIPELINE.toggle_branch() },
        { id: 'view.terminal', title: 'toggle terminal', keys: 'Alt + T', run: () => toggle_terminal() },
        { id: 'view.output', title: 'show output', keys: 'Alt + I', run: () => toggle_terminal(1, 'output') },
        { id: 'view.console', title: 'show console', keys: 'Alt + J', run: () => toggle_terminal(1, 'console') },
        { id: 'view.theme', title: 'toggle light / dark theme', keys: 'Alt + K', run: () => set_theme('toggle') },
        { id: 'view.settings', title: 'open settings', keys: `${mod} + ,`, run: () => SETTINGS.open() },
        { id: 'view.extensions', title: 'open extensions', keys: 'Alt + Shift + X', run: () => EXTENSIONS.open() },
        { id: 'window.new', title: 'new editor window', keys: 'Alt + W', run: () => create_window() },
    ].forEach(c => COMMAND(c));

    status();
});
