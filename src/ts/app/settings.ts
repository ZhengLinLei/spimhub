/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/settings.ts

    [settings] group. Saved in localStorage (sh-settings):

        appearance   theme, font size
        editor       tab size, autosave
        runner       default architecture
        pipeline     forwarding, branch stage
        extensions   servers (repositories)
        data         download / open project, reset

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface Settings {
    lang: Lang;
    theme: 'light' | 'dark';
    font: FontId;
    fontSize: number;
    tabSize: number;
    autosave: boolean;
    arch: 'auto' | 'mips' | 'riscv';
    forwarding: boolean;
    branchStage: 'ID' | 'EX';
}

type FontId = 'courier' | 'courier-prime' | 'cutive' | 'plex' | 'red-hat';

// Editor / interface fonts (Courier Prime, Cutive Mono, IBM Plex Mono and Red Hat Mono come from Google Fonts)
const FONTS: Record<FontId, [string, string]> = {
    'courier':       ['Courier New', "'Courier New', 'Courier Prime', 'Cutive Mono', Courier, monospace"],
    'courier-prime': ['Courier Prime', "'Courier Prime', 'Cultive Mono', Courier, monospace"],
    'cutive':        ['Cutive Mono', "'Cutive Mono', 'Courier Prime', 'Courier New', monospace"],
    'plex':          ['IBM Plex Mono', "'IBM Plex Mono', 'Courier New', monospace"],
    'red-hat':       ['Red Hat Mono', "'Red Hat Mono', 'Courier New', monospace"],
};

interface SettingsApi {
    open(section?: string): void;
    render(): void;
    get<K extends keyof Settings>(key: K): Settings[K];
    set<K extends keyof Settings>(key: K, value: Settings[K]): void;
    reset(): Promise<void>;
}

let SETTINGS: SettingsApi;

window.addEventListener('load', () => {

    const KEY = 'sh-settings';
    const escape = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const DEFAULTS: Settings = {
        theme: (document.documentElement.getAttribute('theme') as Settings['theme']) || 'light',
        lang: I18N.lang,
        font: 'courier-prime', fontSize: 12, tabSize: 4, autosave: false, arch: 'auto', forwarding: true, branchStage: 'EX',
    };
    let settings: Settings = { ...DEFAULTS };
    try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* defaults */ }

    const main = document.querySelector<HTMLElement>('#main-settings .settings-main');

    const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* Storage disabled */ }
    };

    // ---------------- Apply ----------------
    const apply = (key?: keyof Settings) => {
        if (!key || key === 'theme') {
            if (document.documentElement.getAttribute('theme') !== settings.theme) set_theme(settings.theme);
        }
        if (!key || key === 'lang') I18N.set(settings.lang);
        if (!key || key === 'font') {
            const font = FONTS[settings.font] || FONTS.courier;
            document.documentElement.style.setProperty('--font-mono', font[1]);
        }
        if (!key || key === 'fontSize') document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
        if (!key || key === 'tabSize') TAB_SIZE = settings.tabSize;
        if (!key || key === 'arch') RUNNER.set_arch(settings.arch, false);
        if (!key || key === 'forwarding' || key === 'branchStage') {
            RUNNER.spim.setPipelineOptions({ forwarding: settings.forwarding, branchStage: settings.branchStage });
            if (key) PIPELINE.refresh();
        }
        UX.status();
    };

    const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        settings[key] = value;
        save();
        apply(key);
        render();
    };

    // The theme can also change from the menus / shortcuts
    HUB.on('theme', (theme) => { if (settings.theme !== theme) { settings.theme = theme; save(); render(); } });
    // The language can also change from the palette / status bar
    HUB.on('lang', (lang) => { if (settings.lang !== lang) { settings.lang = lang; save(); } render(); });

    // ---------------- Autosave ----------------
    let autosave: ReturnType<typeof setTimeout> | null = null;
    document.querySelector('#main-editor').addEventListener('input', () => {
        if (!settings.autosave) return;
        if (autosave) clearTimeout(autosave);
        autosave = setTimeout(() => { html_save('all'); UX.status(); }, 1200);
    });

    // ---------------- Render ----------------
    const choice = <K extends keyof Settings>(key: K, values: [Settings[K], string][]) =>
        `<span class="choice">${values.map(([v, label]) =>
            `<a data-set="${key}" data-value="${escape(JSON.stringify(v))}" class="${settings[key] === v ? 'active' : ''}">[${label}]</a>`).join('')}</span>`;

    const servers_html = () => {
        if (typeof EXTENSIONS === 'undefined' || !EXTENSIONS) return '<p class="muted">loading...</p>';
        const states = EXTENSIONS.server_state();
        const rows = EXTENSIONS.servers().map(s => {
            const st = states.find(x => x.config.url === s.url);
            const status = !s.enabled ? '<span class="muted">disabled</span>'
                : !st || st.status === 'loading' ? '<span class="muted">loading...</span>'
                : st.status === 'online' ? `<span class="text-ok">online · ${st.extensions.length} extensions</span>`
                : `<span class="text-error" title="${escape(st.error)}">offline</span>`;
            return `<tr>
                <td>${escape(st?.name || s.name)}${s.builtin ? ' <span class="muted">(default)</span>' : ''}</td>
                <td class="url">${escape(s.url)}</td>
                <td>${status}</td>
                <td class="actions">
                    <a data-server-toggle="${escape(s.url)}">[${s.enabled ? 'disable' : 'enable'}]</a>
                    <a data-server-remove="${escape(s.url)}">[remove]</a>
                </td>
            </tr>`;
        }).join('');
        return `<table class="servers">${rows || '<tr><td class="muted">no servers</td></tr>'}</table>
            <div class="add-server">
                <input type="text" class="server-name" placeholder="name" spellcheck="false">
                <input type="text" class="server-url" placeholder="https://example.com/spimhub-extensions/" spellcheck="false">
                <a class="server-add bg-success">[add server]</a>
            </div>
            <p class="muted">${escape(T('A server is a folder served over HTTP with an index.json in its root and one folder per extension (manifest.json, main.js...). Extensions run JavaScript inside SpimHub: add only servers you trust. Example: the extensions/ folder of the repository.'))}</p>`;
    };

    const render = () => {
        if (!main) return;
        main.innerHTML = `
            <section data-section="appearance">
                <h3>[appearance]</h3>
                <div class="row"><span>language</span>${choice('lang', (Object.keys(LANGS) as Lang[]).map(l => [l, LANGS[l]] as [Lang, string]))}</div>
                <div class="row"><span>theme</span>${choice('theme', [['light', 'light'], ['dark', 'dark']])}</div>
                <div class="row"><span>font</span>${choice('font', (Object.keys(FONTS) as FontId[]).map(f => [f, FONTS[f][0]] as [FontId, string]))}</div>
                <p class="muted">Courier New uses the font of the system; where it is not installed (Linux) Courier Prime is used, a font designed after Courier New.</p>
                <div class="row"><span>font size</span>${choice('fontSize', [[11, '11'], [12, '12'], [13, '13'], [14, '14'], [16, '16']])}</div>
            </section>
            <section data-section="editor">
                <h3>[editor]</h3>
                <div class="row"><span>tab size</span>${choice('tabSize', [[2, '2'], [4, '4'], [8, '8']])}</div>
                <div class="row"><span>autosave</span>${choice('autosave', [[false, 'off'], [true, 'on']])}<span class="muted">saves every open file 1s after typing</span></div>
            </section>
            <section data-section="runner">
                <h3>[runner]</h3>
                <div class="row"><span>architecture</span>${choice('arch', [['auto', 'auto'], ['mips', 'mips'], ['riscv', 'risc-v']])}<span class="muted">auto: detected from the source</span></div>
            </section>
            <section data-section="pipeline">
                <h3>[pipeline]</h3>
                <div class="row"><span>forwarding</span>${choice('forwarding', [[true, 'on'], [false, 'off']])}</div>
                <div class="row"><span>branches resolved in</span>${choice('branchStage', [['EX', 'EX'], ['ID', 'ID']])}</div>
            </section>
            <section data-section="servers">
                <h3>[extension servers]</h3>
                ${servers_html()}
            </section>
            <section data-section="data">
                <h3>[data]</h3>
                <div class="row">
                    <a href="javascript:download_project()">[download project]</a>
                    <a href="javascript:__pop_up._open_project()">[open project]</a>
                    <a class="reset-settings">[reset settings]</a>
                    <a href="javascript:__pop_up._new_project()" class="text-error">[new project]</a>
                </div>
                <p class="muted">Files, settings and extensions are saved in this browser (localStorage).</p>
            </section>`;
        // Each font option is shown with its own font
        main.querySelectorAll<HTMLElement>('a[data-set="font"]').forEach(a => {
            const font = FONTS[JSON.parse(a.dataset.value) as FontId];
            if (font) a.style.fontFamily = font[1];
        });
    };

    main.addEventListener('click', async (e) => {
        const t = e.target as HTMLElement;
        const opt = t.closest<HTMLElement>('[data-set]');
        if (opt) { set(opt.dataset.set as keyof Settings, JSON.parse(opt.dataset.value) as never); return; }
        const toggle = t.closest<HTMLElement>('[data-server-toggle]');
        if (toggle) { EXTENSIONS.toggle_server(toggle.dataset.serverToggle); return; }
        const remove = t.closest<HTMLElement>('[data-server-remove]');
        if (remove) {
            const url = remove.dataset.serverRemove;
            if (await CONFIRM(`Remove the server ${url}? Installed extensions stay installed.`, { title: 'server', ok: 'remove', danger: true })) EXTENSIONS.remove_server(url);
            return;
        }
        if (t.closest('.server-add')) {
            const url = main.querySelector<HTMLInputElement>('.server-url').value;
            const name = main.querySelector<HTMLInputElement>('.server-name').value;
            await EXTENSIONS.add_server(url, name);
            return;
        }
        if (t.closest('.reset-settings')) SETTINGS.reset();
    });
    main.addEventListener('keydown', (e) => {
        if ((e.target as Element).closest('.add-server') && e.key === 'Enter') {
            e.preventDefault();
            main.querySelector<HTMLElement>('.server-add').click();
        }
    });

    SETTINGS = {
        open: (section) => {
            render();
            __group_h.open_group('settings');
            if (section) main.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ block: 'start' });
        },
        render,
        get: (key) => settings[key],
        set,
        reset: async () => {
            if (!await CONFIRM('Restore the default settings? Files and extensions are not touched.', { title: 'settings', ok: 'reset' })) return;
            settings = { ...DEFAULTS, theme: 'light' };
            save();
            apply();
            render();
            NOTIFY('settings restored', 'success');
        },
    };

    apply();
    render();
});
