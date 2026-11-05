/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/finder.ts

    Find / replace inside the active file (Ctrl + F, Alt + F).

        ┌──────────────────────────────────────────────────────┐
        │ [find........] [Aa][ab][.*]  3/12  [↑][↓][≡][x]       │
        │ [replace.....] [replace] [all]                         │
        └──────────────────────────────────────────────────────┘

    Every match is painted in a transparent layer (pre.find-layer) placed
    between the highlighted code and the textarea.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface FinderApi {
    open(replace?: boolean, query?: string): void;
    close(): void;
    next(): void;
    prev(): void;
    refresh(): void;
    // Shows a match found by the global search
    reveal(file: EditorFile, start: number, end: number, query?: string): void;
}

let FINDER: FinderApi;

window.addEventListener('load', () => {

    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const opts = { case: false, word: false, regex: false };
    let file: EditorFile | null = null;      // File where the bar is open
    let matches: [number, number][] = [];
    let current = -1;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // ---------------- DOM (one bar per editor window) ----------------
    const BAR = `
        <div class="find-row">
            <input type="text" class="find-input" placeholder="find" spellcheck="false" autocomplete="off">
            <a class="find-flag" data-flag="case" title="Match case">[Aa]</a>
            <a class="find-flag" data-flag="word" title="Whole word">[ab]</a>
            <a class="find-flag" data-flag="regex" title="Regular expression">[.*]</a>
            <span class="find-count muted">no results</span>
            <a class="find-prev" title="Previous (Shift + Enter)">[↑]</a>
            <a class="find-next" title="Next (Enter)">[↓]</a>
            <a class="find-toggle" title="Replace (Alt + F)">[≡]</a>
            <a class="find-close" title="Close (Esc)">[x]</a>
        </div>
        <div class="find-row replace-row">
            <input type="text" class="replace-input" placeholder="replace" spellcheck="false" autocomplete="off">
            <a class="replace-one" title="Replace (Enter)">[replace]</a>
            <a class="replace-all" title="Replace all (Ctrl + Alt + Enter)">[all]</a>
        </div>`;

    const bar_of = (w: HTMLElement): HTMLElement => {
        let bar = w.querySelector<HTMLElement>(':scope > .find-bar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.className = 'find-bar';
        bar.innerHTML = BAR;
        w.appendChild(bar);

        const input = bar.querySelector<HTMLInputElement>('.find-input');
        const rinput = bar.querySelector<HTMLInputElement>('.replace-input');
        input.addEventListener('input', () => { current = -1; search(true); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next(); }
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        rinput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); replace_all(); return; }
            if (e.key === 'Enter') { e.preventDefault(); replace_one(); }
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        bar.querySelectorAll<HTMLElement>('.find-flag').forEach(a => a.addEventListener('click', () => {
            const f = a.getAttribute('data-flag') as keyof typeof opts;
            opts[f] = !opts[f];
            sync_flags();
            search(true);
            input.focus();
        }));
        bar.querySelector('.find-prev').addEventListener('click', () => prev());
        bar.querySelector('.find-next').addEventListener('click', () => next());
        bar.querySelector('.find-close').addEventListener('click', () => close());
        bar.querySelector('.find-toggle').addEventListener('click', () => {
            bar.classList.toggle('with-replace');
            (bar.classList.contains('with-replace') ? rinput : input).focus();
        });
        bar.querySelector('.replace-one').addEventListener('click', () => replace_one());
        bar.querySelector('.replace-all').addEventListener('click', () => replace_all());
        // Clicks inside the bar must not change the active window
        bar.addEventListener('click', (e) => e.stopPropagation());
        return bar;
    };

    const sync_flags = () => {
        document.querySelectorAll<HTMLElement>('.find-bar .find-flag').forEach(a => {
            a.classList.toggle('active', opts[a.getAttribute('data-flag') as keyof typeof opts]);
        });
    };

    const window_of = (f: EditorFile) => f.__fw.closest<HTMLElement>('.editor-window');
    const textarea_of = (f: EditorFile) => f.__f.querySelector('textarea');

    const layer_of = (f: EditorFile): HTMLElement => {
        let layer = f.__f.querySelector<HTMLElement>('.find-layer');
        if (layer) return layer;
        layer = document.createElement('pre');
        layer.className = 'export-code find-layer';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<code></code>';
        f.__f.insertBefore(layer, f.__f.querySelector('textarea'));
        const ta = textarea_of(f);
        ta.addEventListener('scroll', () => layer.scrollTo(ta.scrollLeft, ta.scrollTop));
        ta.addEventListener('input', () => {
            if (file === f && window_of(f).querySelector('.find-bar.active')) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => search(false), 120);
            }
        });
        return layer;
    };

    // ---------------- Search ----------------
    const regex = (q: string): RegExp | null => {
        if (!q) return null;
        try {
            let src = opts.regex ? q : escapeRe(q);
            if (opts.word) src = `\\b(?:${src})\\b`;
            return new RegExp(src, opts.case ? 'g' : 'gi');
        } catch (e) {
            return null;
        }
    };

    const paint = () => {
        if (!file) return;
        const layer = layer_of(file);
        const text = textarea_of(file).value;
        let html = '', last = 0;
        matches.forEach(([s, e], i) => {
            html += escape(text.slice(last, s)) + `<mark${i === current ? ' class="current"' : ''}>${escape(text.slice(s, e)) || ' '}</mark>`;
            last = e;
        });
        html += escape(text.slice(last));
        // Same structure as the highlighted code: one <p> per line
        // (the "\n" between the inline-block <p> makes the line breaks, as in Format.JoinCode)
        layer.firstElementChild.innerHTML = html.split('\n').map(l => `<p>${l || ' '}</p>`).join('\n');
        const ta = textarea_of(file);
        layer.scrollTo(ta.scrollLeft, ta.scrollTop);
    };

    const count = () => {
        const bar = window_of(file).querySelector('.find-bar');
        const input = bar.querySelector<HTMLInputElement>('.find-input');
        const c = bar.querySelector('.find-count');
        const bad = !!input.value && !regex(input.value);
        input.classList.toggle('invalid', bad);
        c.textContent = bad ? 'invalid regex' : !input.value ? '' : matches.length ? `${current + 1}/${matches.length}` : 'no results';
        c.classList.toggle('text-error', !!input.value && !matches.length);
    };

    /**
     * Finds every match. `jump`: select the first match after the cursor
     */
    const search = (jump: boolean) => {
        if (!file || !file.__f.isConnected) return;
        const bar = window_of(file).querySelector('.find-bar');
        const q = bar.querySelector<HTMLInputElement>('.find-input').value;
        const re = regex(q);
        const ta = textarea_of(file);
        matches = [];
        if (re) {
            let m: RegExpExecArray | null;
            while ((m = re.exec(ta.value)) && matches.length < 10000) {
                if (m[0].length === 0) { re.lastIndex++; continue; }
                matches.push([m.index, m.index + m[0].length]);
            }
        }
        if (jump && matches.length) {
            const from = ta.selectionStart;
            current = Math.max(0, matches.findIndex(([s]) => s >= from));
            show(false);
        } else if (current >= matches.length) current = matches.length - 1;
        paint();
        count();
    };

    const show = (focus: boolean) => {
        if (!file || current < 0 || !matches[current]) return;
        const [s, e] = matches[current];
        UX.reveal(textarea_of(file), s, e, focus);
        paint();
        count();
    };

    const next = () => {
        if (!matches.length) return;
        current = (current + 1) % matches.length;
        show(false);
    };
    const prev = () => {
        if (!matches.length) return;
        current = (current - 1 + matches.length) % matches.length;
        show(false);
    };

    // ---------------- Replace ----------------
    const replacement = (match: string): string => {
        const r = window_of(file).querySelector<HTMLInputElement>('.replace-input').value;
        const re = regex(window_of(file).querySelector<HTMLInputElement>('.find-input').value);
        if (!opts.regex || !re) return r;
        re.lastIndex = 0;
        return match.replace(re, r);    // $1, $2... in regex mode
    };

    const replace_one = () => {
        if (!file || !matches.length) return;
        if (current < 0) current = 0;
        const ta = textarea_of(file);
        const [s, e] = matches[current];
        const bar = window_of(file).querySelector<HTMLElement>('.find-bar');
        UX.insert(ta, replacement(ta.value.slice(s, e)), s, e);
        search(false);
        if (matches.length) {
            current = Math.max(0, matches.findIndex(([ms]) => ms >= s));
            if (current >= matches.length) current = 0;
            show(false);
        }
        bar.querySelector<HTMLInputElement>('.replace-input').focus();
    };

    const replace_all = () => {
        if (!file || !matches.length) return;
        const ta = textarea_of(file);
        const n = matches.length;
        let out = '', last = 0;
        matches.forEach(([s, e]) => { out += ta.value.slice(last, s) + replacement(ta.value.slice(s, e)); last = e; });
        out += ta.value.slice(last);
        UX.insert(ta, out, 0, ta.value.length);     // one undo step
        current = -1;
        search(false);
        NOTIFY(`${n} replacement${n === 1 ? '' : 's'} in ${file.name}`, 'success');
        window_of(file).querySelector<HTMLInputElement>('.replace-input').focus();
    };

    // ---------------- Open / close ----------------
    const open = (withReplace = false, query?: string) => {
        const f = RUNNER.get_active();
        if (!f) { NOTIFY('open a file to search in it', 'warning'); return; }
        if (file && file !== f) close(false);
        file = f;
        __group_h.open_group('editor');
        const bar = bar_of(window_of(f));
        layer_of(f);
        bar.classList.add('active');
        bar.classList.toggle('with-replace', withReplace);
        sync_flags();
        const input = bar.querySelector<HTMLInputElement>('.find-input');
        const ta = textarea_of(f);
        const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (query !== undefined) input.value = query;
        else if (selected && !selected.includes('\n')) input.value = selected;
        input.focus();
        input.select();
        current = -1;
        search(true);
    };

    const close = (focus = true) => {
        if (!file) return;
        const f = file;
        const w = window_of(f);
        w?.querySelector('.find-bar')?.classList.remove('active');
        const layer = f.__f.querySelector('.find-layer code');
        if (layer) layer.innerHTML = '';
        matches = [];
        file = null;
        if (focus && f.__f.isConnected) textarea_of(f).focus();
    };

    FINDER = {
        open, close, next, prev,
        refresh: () => search(false),
        reveal: (f, start, end, query) => {
            open(false, query);
            const ta = textarea_of(f);
            search(false);
            current = matches.findIndex(([s]) => s === start);
            if (current < 0) UX.reveal(ta, start, end, true);
            else show(true);
        },
    };

    // Following the active file: the bar belongs to one file
    HUB.on('file-open', (e: { route: string; name: string }) => {
        if (file && (e.route !== file.route || e.name !== file.name)) close(false);
    });
});
