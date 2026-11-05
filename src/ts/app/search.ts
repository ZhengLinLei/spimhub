/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/search.ts

    [search] panel: search / replace in every file of the project.

        - Live results while typing (case, whole word, regex)
        - Files filter: "*.asm, /examples/riscv/, !hello.asm"
        - Results grouped by file, line number + context, collapsible
        - Click (or Enter) opens the file with the match selected
        - Replace in a file / in every file (open files keep the undo)
        - ↑ ↓ to move between results

    (Replaces the old src/js/file_searcher.js)

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface SearchApi {
    open(query?: string): void;
    toggle(): void;
    flag(name: 'case' | 'word' | 'regex'): void;
    replace_all(): void;
    collapse(): void;
    run(): void;
}

let SEARCH: SearchApi;

window.addEventListener('load', () => {

    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const el = {
        query: $<HTMLInputElement>('#search-query'),
        replace: $<HTMLInputElement>('#search-replace'),
        include: $<HTMLInputElement>('#search-include'),
        summary: $('#opt-search .search-summary'),
        results: $('#search-results'),
        flags: document.querySelectorAll<HTMLElement>('#opt-search .flag'),
        replaceAll: $('#opt-search .search-replace-all'),
    };

    const opts = { case: false, word: false, regex: false };
    const MAX_RESULTS = 2000;

    interface Match { start: number; end: number; line: number; col: number; text: string; }
    interface FileResult { file: FSFile; route: string; content: string; matches: Match[]; }
    let results: FileResult[] = [];
    let collapsed = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // ---------------- Helpers ----------------
    const regex = (): RegExp | null => {
        const q = el.query.value;
        if (!q) return null;
        try {
            let src = opts.regex ? q : escapeRe(q);
            if (opts.word) src = `\\b(?:${src})\\b`;
            return new RegExp(src, opts.case ? 'g' : 'gi');
        } catch (e) {
            return null;
        }
    };

    // Opened file (it may have unsaved changes)
    const opened = (file: FSFile): EditorFile | null => {
        for (const w of Object.values(WINDOW_EDITOR.files)) {
            const f = w.find(m => m.route + m.name === file.route + file.name);
            if (f) return f;
        }
        return null;
    };
    const content_of = (file: FSFile) => {
        const o = opened(file);
        return o ? o.content : file.content;
    };

    // "*.asm, /examples/riscv/, !hello.asm"
    const include_filter = () => {
        const parts = el.include.value.split(',').map(p => p.trim()).filter(Boolean);
        if (!parts.length) return () => true;
        const glob = (g: string) => new RegExp('^' + g.split('*').map(escapeRe).join('.*') + '$', 'i');
        const tests = parts.map(p => {
            const neg = p.startsWith('!');
            const pat = neg ? p.slice(1) : p;
            const test = pat.startsWith('/')
                ? (route: string, name: string) => (route + name).startsWith(pat) || glob(pat).test(route + name)
                : (_: string, name: string) => glob(pat).test(name);
            return { neg, test };
        });
        const pos = tests.filter(t => !t.neg), neg = tests.filter(t => t.neg);
        return (route: string, name: string) =>
            (!pos.length || pos.some(t => t.test(route, name))) && !neg.some(t => t.test(route, name));
    };

    const all_files = (): FSFile[] => {
        const out: FSFile[] = [];
        const walk = (route: string) => {
            const f = FILE_SYSTEM[route];
            if (!f) return;
            Object.values(f.files).sort((a, b) => a.name.localeCompare(b.name)).forEach(x => out.push(x));
            f.folders.filter(Boolean).slice().sort().forEach(d => walk(`${route}${d}/`));
        };
        walk('/');
        return out;
    };

    // ---------------- Search ----------------
    const run = () => {
        const re = regex();
        el.query.classList.toggle('invalid', !!el.query.value && !re);
        results = [];
        if (!re) {
            el.summary.textContent = el.query.value ? 'invalid regular expression' : 'type to search in every file of the project';
            el.results.innerHTML = '';
            return;
        }
        const accept = include_filter();
        let total = 0;
        for (const file of all_files()) {
            if (!accept(file.route, file.name)) continue;
            const content = content_of(file);
            const matches: Match[] = [];
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(content)) && total < MAX_RESULTS) {
                if (!m[0].length) { re.lastIndex++; continue; }
                const before = content.slice(0, m.index);
                const lineStart = before.lastIndexOf('\n') + 1;
                let lineEnd = content.indexOf('\n', m.index);
                if (lineEnd === -1) lineEnd = content.length;
                matches.push({
                    start: m.index, end: m.index + m[0].length,
                    line: before.split('\n').length, col: m.index - lineStart,
                    text: content.slice(lineStart, lineEnd),
                });
                total++;
            }
            if (matches.length) results.push({ file, route: file.route + file.name, content, matches });
        }
        render(total);
    };

    const run_soon = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, 140);
    };

    // ---------------- Render ----------------
    const context = (m: Match) => {
        // Trim long lines around the match
        let s = m.col, e = m.col + (m.end - m.start);
        let from = Math.max(0, s - 24);
        const text = m.text;
        const pre = (from > 0 ? '…' : '') + text.slice(from, s).replace(/^\s+/, '');
        return `${escape(pre)}<mark>${escape(text.slice(s, e))}</mark>${escape(text.slice(e, e + 60))}`;
    };

    const render = (total: number) => {
        const files = results.length;
        el.summary.innerHTML = total
            ? `${total}${total >= MAX_RESULTS ? '+' : ''} result${total === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`
            : 'no results';
        el.replaceAll.classList.toggle('disabled', !total);
        el.results.innerHTML = results.map((r, fi) => {
            const isOpen = !collapsed.has(r.route);
            const name = r.file.name;
            const dir = r.file.route;
            return `<div class="sr-file${isOpen ? ' open' : ''}" data-f="${fi}">
                <div class="sr-head" data-f="${fi}" tabindex="-1">
                    <span class="sr-arrow">${isOpen ? '-' : '+'}</span>
                    <span class="sr-name">${escape(name)}</span>
                    <span class="sr-dir muted">${escape(dir)}</span>
                    <span class="sr-count">${r.matches.length}</span>
                    <a class="sr-replace" data-f="${fi}" title="Replace in this file">[r]</a>
                </div>
                <ul>${r.matches.map((m, mi) => `
                    <li class="sr-match" data-f="${fi}" data-m="${mi}" tabindex="-1">
                        <span class="sr-line muted">${m.line}</span><span class="sr-text">${context(m)}</span>
                    </li>`).join('')}</ul>
            </div>`;
        }).join('');
    };

    // ---------------- Open a result ----------------
    const reveal = (fi: number, mi: number) => {
        const r = results[fi];
        if (!r) return;
        const m = r.matches[mi];
        open_file(r.file);
        const f = opened(r.file);
        if (f) setTimeout(() => FINDER.reveal(f, m.start, m.end, el.query.value), 0);
        el.results.querySelectorAll('.sr-match.active').forEach(x => x.classList.remove('active'));
        el.results.querySelector(`.sr-match[data-f="${fi}"][data-m="${mi}"]`)?.classList.add('active');
    };

    // ---------------- Replace ----------------
    const replacement = (re: RegExp, text: string) => {
        const r = el.replace.value;
        if (!opts.regex) return r;
        re.lastIndex = 0;
        return text.replace(new RegExp(re.source, re.flags.replace('g', '')), r);
    };

    const replace_in = (r: FileResult): number => {
        const re = regex();
        if (!re) return 0;
        const o = opened(r.file);
        const content = content_of(r.file);
        let out = '', last = 0, n = 0;
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content))) {
            if (!m[0].length) { re.lastIndex++; continue; }
            out += content.slice(last, m.index) + replacement(re, m[0]);
            last = m.index + m[0].length;
            n++;
        }
        out += content.slice(last);
        if (!n) return 0;
        if (o) {
            // Opened file: edit the editor (unsaved, undo works)
            const ta = o.__f.querySelector('textarea');
            ta.value = out;
            update_code(ta, o, o.file);
        } else {
            r.file.content = out;
        }
        return n;
    };

    const replace_files = async (list: FileResult[]) => {
        const total = list.reduce((s, r) => s + r.matches.length, 0);
        if (!total) return;
        const ok = await CONFIRM(`Replace ${total} match${total === 1 ? '' : 'es'} in ${list.length} file${list.length === 1 ? '' : 's'} with "${el.replace.value}"?` +
            ' Closed files are saved, open files stay unsaved.', { title: 'replace', ok: 'replace' });
        if (!ok) return;
        let n = 0;
        list.forEach(r => { n += replace_in(r); });
        SAVE_FILE_SYSTEM();
        NOTIFY(`${n} replacement${n === 1 ? '' : 's'} in ${list.length} file${list.length === 1 ? '' : 's'}`, 'success');
        run();
    };

    // ---------------- Events ----------------
    [el.query, el.include].forEach(i => i.addEventListener('input', run_soon));
    el.query.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); replace_files(results); return; }
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (timer) { clearTimeout(timer); run(); }
            const first = el.results.querySelector<HTMLElement>('.sr-match');
            if (first) { first.focus(); reveal(+first.dataset.f, +first.dataset.m); }
        }
        if (e.key === 'Escape') { el.query.value = ''; run(); }
    });
    el.replace.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); replace_files(results); }
    });

    el.results.addEventListener('click', (e) => {
        const t = e.target as Element;
        const rep = t.closest<HTMLElement>('.sr-replace');
        if (rep) { e.stopPropagation(); replace_files([results[+rep.dataset.f]]); return; }
        const head = t.closest<HTMLElement>('.sr-head');
        if (head) {
            const r = results[+head.dataset.f];
            if (collapsed.has(r.route)) collapsed.delete(r.route); else collapsed.add(r.route);
            head.parentElement.classList.toggle('open');
            head.querySelector('.sr-arrow').textContent = head.parentElement.classList.contains('open') ? '-' : '+';
            return;
        }
        const li = t.closest<HTMLElement>('.sr-match');
        if (li) { li.focus(); reveal(+li.dataset.f, +li.dataset.m); }
    });

    // Keyboard navigation between results
    el.results.addEventListener('keydown', (e) => {
        const items = [...el.results.querySelectorAll<HTMLElement>('.sr-file.open .sr-match')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
            if (n) { n.focus(); reveal(+n.dataset.f, +n.dataset.m); }
            if (i <= 0 && e.key === 'ArrowUp') el.query.focus();
        }
        if (e.key === 'Enter' && i >= 0) { e.preventDefault(); reveal(+items[i].dataset.f, +items[i].dataset.m); }
    });

    // Keep the results fresh while editing
    HUB.on('file-save', () => { if (el.query.value) run_soon(); });

    const open = (query?: string) => {
        toggle_opt(1, 'search');
        const ta = UX.active_textarea();
        const sel = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
        if (query !== undefined) el.query.value = query;
        else if (sel && !sel.includes('\n')) el.query.value = sel;
        el.query.focus();
        el.query.select();
        run();
    };

    SEARCH = {
        open,
        toggle: () => {
            const header = $('#main-folder');
            if (header.classList.contains('active') && header.classList.contains('opt-search')) toggle_opt(0, 'search');
            else open();
        },
        flag: (name) => {
            opts[name] = !opts[name];
            el.flags.forEach(a => a.classList.toggle('active', opts[a.getAttribute('flag') as keyof typeof opts]));
            run();
            el.query.focus();
        },
        replace_all: () => replace_files(results),
        collapse: () => {
            const all = results.every(r => collapsed.has(r.route));
            collapsed = all ? new Set() : new Set(results.map(r => r.route));
            run();
        },
        run,
    };
});
