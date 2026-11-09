/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/extensions.ts

    Extensions: servers (repositories), marketplace, installer and host.

    A server is any URL with:

        <server>/index.json                 list of extensions
        <server>/<path>/manifest.json       one extension
        <server>/<path>/main.js             code (optional)
        <server>/<path>/style.css           styles (optional)
        <server>/<path>/README.md           documentation (optional)

    index.json
        { "name": "...", "description": "...", "version": 1,
          "extensions": [ { "id", "name", "version", "description", "author",
                            "path", "icon", "tags", "default" } ] }

    manifest.json
        { "id", "name", "version", "description", "author", "license",
          "main": "main.js", "styles": "style.css", "readme": "README.md",
          "engines": { "spimhub": ">=1.1.0" }, "contributes": { ... } }

    The installed extensions are stored (code included) in localStorage and
    run on every start: main.js receives the `spimhub` API (see `api()`).
    Example server: /extensions in the repository.

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface ServerConfig { url: string; name: string; enabled: boolean; builtin?: boolean; }
interface ExtEntry {
    id: string; name: string; version: string; description?: string; author?: string;
    path: string; icon?: string; tags?: string[]; default?: boolean;
}
interface ExtManifest {
    id: string; name: string; version: string; description?: string; author?: string; license?: string;
    main?: string; styles?: string; readme?: string; icon?: string; tags?: string[];
    engines?: { spimhub?: string }; contributes?: Record<string, unknown>;
}
interface Installed {
    manifest: ExtManifest; code: string; css: string; readme: string;
    server: string; installedAt: number; enabled: boolean; error?: string;
}
interface ServerState {
    config: ServerConfig;
    status: 'loading' | 'online' | 'offline' | 'disabled';
    name: string;
    description?: string;
    error?: string;
    extensions: ExtEntry[];
}

interface ExtensionsApi {
    open(id?: string): void;
    toggle(): void;
    refresh(): Promise<void>;
    filter(tab: 'all' | 'installed'): void;
    show(id: string): void;
    install(id: string): Promise<void>;
    uninstall(id: string): Promise<void>;
    enable(id: string, on: boolean): void;
    servers(): ServerConfig[];
    server_state(): ServerState[];
    add_server(url: string, name?: string): Promise<boolean>;
    remove_server(url: string): void;
    toggle_server(url: string): void;
    installed(): Record<string, Installed>;
}

let EXTENSIONS: ExtensionsApi;

window.addEventListener('load', () => {

    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const escape = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const KEY = { servers: 'sh-ext-servers', installed: 'sh-ext-installed', data: 'sh-ext-data-' };
    const DEFAULT_SERVERS: ServerConfig[] = [
        // Same origin: Docker / npm start serve the repository folder extensions/
        { url: './extensions/', name: 'local', enabled: true, builtin: true },
        // GitHub (works from GitHub Pages)
        { url: 'https://raw.githubusercontent.com/ZhengLinLei/spimhub/main/extensions/', name: 'github', enabled: true, builtin: true },
    ];
    const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

    const load = <T>(key: string, def: T): T => {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    };
    const store = (key: string, v: unknown) => {
        try { localStorage.setItem(key, JSON.stringify(v)); return true; }
        catch (e) { NOTIFY('localStorage is full or disabled: the change was not saved', 'error'); return false; }
    };

    let servers: ServerConfig[] = load(KEY.servers, null) || DEFAULT_SERVERS.map(s => ({ ...s }));
    let installed: Record<string, Installed> = load(KEY.installed, {});
    const first_run = localStorage.getItem(KEY.installed) === null;
    let states: ServerState[] = [];
    let tab: 'all' | 'installed' = 'all';
    let selected: string | null = null;

    const save_servers = () => store(KEY.servers, servers);
    const save_installed = () => store(KEY.installed, installed);

    const base_of = (url: string) => new URL(url.endsWith('/') ? url : url + '/', location.href);
    const fetch_text = async (url: URL) => {
        const r = await fetch(url.href, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`${r.status} ${url.href}`);
        return r.text();
    };
    const fetch_json = async <T>(url: URL): Promise<T> => JSON.parse(await fetch_text(url));

    // Semver like comparison "1.2.10" > "1.2.9"
    const newer = (a: string, b: string) => {
        const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
        }
        return false;
    };

    // ================== //
    //  Servers           //
    // ================== //
    const load_server = async (config: ServerConfig): Promise<ServerState> => {
        const state: ServerState = { config, status: 'loading', name: config.name, extensions: [] };
        if (!config.enabled) { state.status = 'disabled'; return state; }
        try {
            const index = await fetch_json<{ name?: string; description?: string; extensions?: ExtEntry[] }>(new URL('index.json', base_of(config.url)));
            if (!Array.isArray(index.extensions)) throw new Error('index.json has no "extensions" list');
            state.name = index.name || config.name;
            state.description = index.description;
            state.extensions = index.extensions.filter(e => e && ID.test(e.id) && e.path && e.name);
            state.status = 'online';
        } catch (e) {
            state.status = 'offline';
            state.error = (e as Error).message;
        }
        return state;
    };

    const refresh = async () => {
        el.status.textContent = 'loading servers...';
        states = servers.map(config => ({ config, status: 'loading', name: config.name, extensions: [] }));
        render();
        states = await Promise.all(servers.map(load_server));
        render();
        if (typeof SETTINGS !== 'undefined' && SETTINGS) SETTINGS.render();
    };

    // Every extension offered by the online servers (first server wins)
    const catalog = (): (ExtEntry & { server: ServerConfig })[] => {
        const seen = new Map<string, ExtEntry & { server: ServerConfig }>();
        states.filter(s => s.status === 'online').forEach(s => s.extensions.forEach(e => {
            if (!seen.has(e.id)) seen.set(e.id, { ...e, server: s.config });
        }));
        return [...seen.values()];
    };

    // ================== //
    //  Host              //
    // ================== //
    const running = new Map<string, { dispose: () => void; panels: HTMLElement[] }>();

    /**
     * The API received by main.js as `spimhub`
     */
    const api = (id: string, manifest: ExtManifest) => {
        const disposers: (() => void)[] = [];
        const panels: HTMLElement[] = [];
        const track = <F extends () => unknown>(fn: F): F => { disposers.push(fn); return fn; };
        const data_key = KEY.data + id;
        const data = (): Record<string, unknown> => load(data_key, {});

        const spimhub = {
            id,
            manifest,
            version: SPIM.VERSION,
            SPIM,
            // Language of the interface (en, es, pt, it, fr); event 'lang' when it changes
            get lang() { return I18N.lang; },
            t: (texts: Record<string, string>) => texts[I18N.lang] ?? texts.en ?? Object.values(texts)[0] ?? '',

            // ---- Events: ready, assemble, run, step, exit, error, output, file-open, file-save, theme
            on: (event: string, fn: (data?: any) => void) => track(HUB.on(event, fn)),

            // ---- Terminal command: spimhub.command('hello', 'says hello', (args, term) => term.print('hi'))
            command: (name: string, desc: string, fn: (args: string[], term: { print: (t: string, cls?: string) => void }) => void, args = '') =>
                track(TERMINAL.register(name, { desc: `${desc} [${id}]`, args, fn: (a: string[]) => fn(a, { print: TERMINAL.print }) })),

            // ---- Command palette entry
            palette: (title: string, fn: () => void) => track(COMMAND({ id: `${id}:${title}`, title, run: fn, source: id })),

            // ---- UI
            notify: (msg: string, type: NotifyType = 'info', timeout?: number) => NOTIFY(String(msg), type, timeout),
            confirm: (msg: string, options?: object) => CONFIRM(String(msg), options),
            log: (msg: string, type = 'info') => RUNNER.log(`[${id}] ${msg}`, type),
            css: (text: string) => {
                const s = document.createElement('style');
                s.dataset.ext = id;
                s.textContent = text;
                document.head.appendChild(s);
                track(() => s.remove());
                return s;
            },
            element: <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Element = document.body) => {
                const e = document.createElement(tag);
                e.dataset.ext = id;
                parent.appendChild(e);
                track(() => e.remove());
                return e;
            },
            status: (text: string, onclick?: () => void, title?: string) => {
                const item = UX.status_item(text, onclick, title || manifest.name);
                track(item.remove);
                return item;
            },
            // Panel shown in the page of the extension ([extensions] → the extension)
            panel: (title: string) => {
                const p = document.createElement('section');
                p.className = 'ext-panel-box';
                p.innerHTML = `<header class="cap"><div>[${escape(title)}]</div></header><main></main>`;
                panels.push(p);
                if (selected === id) show(id);
                track(() => p.remove());
                return p.querySelector('main') as HTMLElement;
            },
            open: () => show(id),

            // ---- Per extension storage
            storage: {
                get: <T>(key: string, def?: T): T => (key in data() ? data()[key] as T : def),
                set: (key: string, value: unknown) => store(data_key, { ...data(), [key]: value }),
                remove: (key: string) => { const d = data(); delete d[key]; store(data_key, d); },
            },

            // ---- Simulator
            get spim() { return RUNNER.spim; },
            runner: {
                assemble: () => RUNNER.assemble(),
                run: () => RUNNER.run_active(),
                step: () => RUNNER.step(),
                reset: () => RUNNER.reset(),
                output: (text: string) => RUNNER.output(String(text)),
                get route() { return RUNNER.route; },
            },

            // ---- Editor
            editor: {
                active: () => {
                    const f = RUNNER.get_active();
                    return f ? { name: f.name, route: f.route, content: f.content, arch: SPIM.detectArch(f.content) } : null;
                },
                insert: (text: string) => {
                    const ta = UX.active_textarea();
                    if (!ta) { NOTIFY('open a file first', 'warning'); return false; }
                    __group_h.open_group('editor');
                    UX.insert(ta, String(text));
                    return true;
                },
                set: (text: string) => {
                    const ta = UX.active_textarea();
                    if (!ta) return false;
                    UX.insert(ta, String(text), 0, ta.value.length);
                    return true;
                },
                files: () => Object.keys(FILE_SYSTEM).flatMap(r => Object.values(FILE_SYSTEM[r].files).map(f => ({ name: f.name, route: f.route }))),
                create: (name: string, content = '', route = '/') => {
                    if (!FILE_SYSTEM[route]) return false;
                    return DND.import_files([{ path: name, content }], route) > 0;
                },
            },

            onDispose: (fn: () => void) => track(fn),
        };

        const dispose = () => {
            disposers.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
            panels.length = 0;
        };
        return { spimhub, dispose, panels };
    };

    const activate = (id: string) => {
        const ext = installed[id];
        if (!ext || !ext.enabled || running.has(id)) return;
        const { spimhub, dispose, panels } = api(id, ext.manifest);
        running.set(id, { dispose, panels });
        try {
            if (ext.css) spimhub.css(ext.css);
            if (ext.code) {
                // The extension runs with the `spimhub` API (and the page)
                new Function('spimhub', `"use strict";\n${ext.code}\n//# sourceURL=spimhub-extension/${id}/main.js`)(spimhub);
            }
            delete ext.error;
        } catch (e) {
            ext.error = (e as Error).message;
            console.error(`[spimhub] extension ${id}:`, e);
            NOTIFY(`extension ${ext.manifest.name} failed: ${ext.error}`, 'error', 8000);
        }
    };

    const deactivate = (id: string) => {
        const r = running.get(id);
        if (!r) return;
        r.dispose();
        running.delete(id);
    };

    // ================== //
    //  Install           //
    // ================== //
    const download = async (entry: ExtEntry, server: ServerConfig): Promise<Installed> => {
        const base = new URL(entry.path.endsWith('/') ? entry.path : entry.path + '/', base_of(server.url));
        const manifest = await fetch_json<ExtManifest>(new URL('manifest.json', base));
        if (manifest.id !== entry.id) throw new Error(`manifest id "${manifest.id}" does not match "${entry.id}"`);
        if (!ID.test(manifest.id)) throw new Error(`invalid id "${manifest.id}"`);
        const [code, css, readme] = await Promise.all([
            manifest.main ? fetch_text(new URL(manifest.main, base)) : '',
            manifest.styles ? fetch_text(new URL(manifest.styles, base)) : '',
            manifest.readme ? fetch_text(new URL(manifest.readme, base)).catch(() => '') : '',
        ]);
        return { manifest: { ...manifest, icon: manifest.icon || entry.icon }, code, css, readme, server: server.url, installedAt: Date.now(), enabled: true };
    };

    const install = async (id: string, silent = false) => {
        const entry = catalog().find(e => e.id === id);
        if (!entry) { NOTIFY(`extension ${id} not found in the servers`, 'error'); return; }
        if (!silent && !entry.server.builtin) {
            const ok = await CONFIRM(`"${entry.name}" comes from ${entry.server.url}. Extensions run JavaScript with access to your project. Install it only if you trust the server.`,
                { title: 'install', ok: 'install' });
            if (!ok) return;
        }
        try {
            const was = installed[id];
            deactivate(id);
            installed[id] = await download(entry, entry.server);
            if (!save_installed()) { delete installed[id]; return; }
            activate(id);
            if (!silent) NOTIFY(`${entry.name} ${installed[id].manifest.version} ${was ? 'updated' : 'installed'}`, 'success');
            render();
            if (selected === id) show(id);
        } catch (e) {
            NOTIFY(`install failed: ${(e as Error).message}`, 'error', 8000);
        }
    };

    const uninstall = async (id: string) => {
        const ext = installed[id];
        if (!ext) return;
        const ok = await CONFIRM(`Uninstall "${ext.manifest.name}"? Its saved data is removed too.`, { title: 'uninstall', ok: 'uninstall', danger: true });
        if (!ok) return;
        deactivate(id);
        delete installed[id];
        save_installed();
        try { localStorage.removeItem(KEY.data + id); } catch (e) { /* Storage disabled */ }
        NOTIFY(`${ext.manifest.name} uninstalled`, 'success');
        render();
        if (selected === id) show(id);
    };

    const enable = (id: string, on: boolean) => {
        const ext = installed[id];
        if (!ext) return;
        ext.enabled = on;
        save_installed();
        if (on) activate(id); else deactivate(id);
        render();
        if (selected === id) show(id);
    };

    // ================== //
    //  UI                //
    // ================== //
    const el = {
        list: $('#extensions-list'),
        status: $('#opt-extensions .ext-status'),
        search: $<HTMLInputElement>('#ext-search'),
        tabs: document.querySelectorAll<HTMLElement>('#opt-extensions .ext-tab'),
        main: $('#main-extensions'),
        countServers: $('#opt-extensions .ext-count-servers'),
        countInstalled: $('#opt-extensions .ext-count-installed'),
        countAll: $('#opt-extensions .ext-count-all'),
    };

    type Item = { id: string; name: string; version: string; description: string; author: string; icon: string; tags: string[];
                  server: string; installed?: Installed; remote?: ExtEntry & { server: ServerConfig } };

    const items = (): Item[] => {
        const remote = catalog();
        const map = new Map<string, Item>();
        remote.forEach(r => map.set(r.id, {
            id: r.id, name: r.name, version: r.version, description: r.description || '', author: r.author || '',
            icon: r.icon || '', tags: r.tags || [], server: r.server.name, remote: r,
        }));
        Object.entries(installed).forEach(([id, ext]) => {
            const m = ext.manifest;
            const it = map.get(id);
            if (it) it.installed = ext;
            else map.set(id, {
                id, name: m.name, version: m.version, description: m.description || '', author: m.author || '',
                icon: m.icon || '', tags: m.tags || [], server: ext.server, installed: ext,
            });
        });
        return [...map.values()].sort((a, b) => (+!!b.installed - +!!a.installed) || a.name.localeCompare(b.name));
    };

    const actions = (it: Item) => {
        if (!it.installed) return `<a data-act="install" data-id="${it.id}">[install]</a>`;
        let html = '';
        if (it.remote && newer(it.remote.version, it.installed.manifest.version)) html += `<a data-act="update" data-id="${it.id}" class="bg-success">[update]</a>`;
        html += `<a data-act="toggle" data-id="${it.id}" class="${it.installed.enabled ? 'on' : 'off'}">[${it.installed.enabled ? 'on' : 'off'}]</a>`;
        html += `<a data-act="uninstall" data-id="${it.id}" title="Uninstall">[x]</a>`;
        return html;
    };

    const render = () => {
        const all = items();
        const q = el.search.value.trim().toLowerCase();
        const shown = all.filter(it => (tab === 'all' || it.installed) &&
            (!q || `${it.name} ${it.description} ${it.tags.join(' ')} ${it.id}`.toLowerCase().includes(q)));
        const online = states.filter(s => s.status === 'online').length;
        const loading = states.some(s => s.status === 'loading');
        el.status.innerHTML = loading ? 'loading servers...'
            : `${online}/${servers.filter(s => s.enabled).length} servers online · <a href="javascript:SETTINGS.open('servers')">[servers]</a>`;
        el.countServers.textContent = `[${online} online]`;
        el.countInstalled.textContent = `[${Object.keys(installed).length}]`;
        el.countAll.textContent = `[${all.length}]`;
        el.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        el.list.innerHTML = shown.map(it => `
            <li class="ext-item${it.id === selected ? ' selected' : ''}${it.installed && !it.installed.enabled ? ' disabled' : ''}" data-id="${it.id}">
                <div class="ext-icon">${escape(it.icon || '[]')}</div>
                <div class="ext-info">
                    <div class="ext-name">${escape(it.name)} <span class="muted">${escape(it.installed ? it.installed.manifest.version : it.version)}</span></div>
                    <div class="ext-desc muted">${escape(it.description)}</div>
                    <div class="ext-meta muted">${escape(it.author)}${it.author ? ' · ' : ''}${escape(it.server)}${it.installed?.error ? ' · <span class="text-error">error</span>' : ''}</div>
                </div>
                <div class="ext-actions">${actions(it)}</div>
            </li>`).join('') || `<li class="muted ext-empty">${tab === 'installed' ? 'no extensions installed' : loading ? '' : 'no extensions (check the servers)'}</li>`;
    };

    // ---- Tiny markdown (README) ----
    const markdown = (md: string) => {
        const lines = escape(md).split('\n');
        let html = '', inCode = false, inList = false;
        const inline = (s: string) => s
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        lines.forEach(l => {
            if (/^```/.test(l)) { html += inCode ? '</pre>' : '<pre class="md-code">'; inCode = !inCode; return; }
            if (inCode) { html += l + '\n'; return; }
            if (/^\s*[-*] /.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`; return; }
            if (inList) { html += '</ul>'; inList = false; }
            const h = /^(#{1,4}) (.*)$/.exec(l);
            if (h) html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
            else if (l.trim()) html += `<p>${inline(l)}</p>`;
        });
        if (inList) html += '</ul>';
        if (inCode) html += '</pre>';
        return html;
    };

    const show = (id: string) => {
        selected = id;
        render();
        const it = items().find(x => x.id === id);
        if (!it) { el.main.innerHTML = '<div class="ext-page muted">extension not found</div>'; return; }
        const m = it.installed?.manifest;
        const meta: [string, string][] = [
            ['id', it.id], ['version', m ? m.version : it.version], ['author', (m?.author || it.author) || '-'],
            ['license', m?.license || '-'], ['server', it.installed?.server || it.remote?.server.url || '-'],
            ['tags', it.tags.join(', ') || '-'],
        ];
        if (it.installed) meta.push(['installed', new Date(it.installed.installedAt).toLocaleString()]);
        el.main.innerHTML = `
            <header class="cap ext-cap">
                <div class="title"> >_ extension <b>${escape(it.name)}</b></div>
                <div class="run d-flex">${actions(it)}</div>
            </header>
            <main class="ext-page">
                <div class="ext-hero">
                    <div class="ext-icon big">${escape(it.icon || '[]')}</div>
                    <div>
                        <h2>${escape(it.name)}</h2>
                        <p class="muted">${escape(m?.description || it.description)}</p>
                        ${it.installed?.error ? `<p class="text-error">error: ${escape(it.installed.error)}</p>` : ''}
                    </div>
                </div>
                <table class="ext-meta-table">${meta.map(([k, v]) => `<tr><td class="muted">[${k}]</td><td>${escape(v)}</td></tr>`).join('')}</table>
                <div class="ext-panels"></div>
                <div class="ext-readme">${it.installed?.readme ? markdown(it.installed.readme) : `<p class="muted">${it.installed ? 'no README' : 'install the extension to read its documentation'}</p>`}</div>
            </main>`;
        const box = el.main.querySelector('.ext-panels');
        running.get(id)?.panels.forEach(p => box.appendChild(p));
        __group_h.open_group('extensions');
    };

    // ---- Events ----
    const on_action = (e: Event) => {
        const a = (e.target as Element).closest<HTMLElement>('[data-act]');
        if (a) {
            e.stopPropagation();
            const id = a.dataset.id;
            switch (a.dataset.act) {
                case 'install': case 'update': install(id); break;
                case 'uninstall': uninstall(id); break;
                case 'toggle': enable(id, !installed[id]?.enabled); break;
            }
            return true;
        }
        return false;
    };
    el.list.addEventListener('click', (e) => {
        if (on_action(e)) return;
        const li = (e.target as Element).closest<HTMLElement>('.ext-item');
        if (li) show(li.dataset.id);
    });
    el.main.addEventListener('click', on_action);
    el.search.addEventListener('input', render);

    // ================== //
    //  API               //
    // ================== //
    EXTENSIONS = {
        open: (id) => {
            toggle_opt(1, 'extensions');
            if (id) show(id);
            else if (!el.main.innerHTML.trim()) {
                el.main.innerHTML = `<main class="ext-page"><h2>[extensions]</h2>
                    <p class="muted">Choose an extension on the left. Extensions come from servers (repositories) that you can add in [settings].</p></main>`;
                __group_h.open_group('extensions');
            }
            el.search.focus();
        },
        toggle: () => {
            const header = $('#main-folder');
            if (header.classList.contains('active') && header.classList.contains('opt-extensions')) toggle_opt(0, 'extensions');
            else EXTENSIONS.open();
        },
        refresh,
        filter: (t) => { tab = t; toggle_opt(1, 'extensions'); render(); },
        show,
        install: (id) => install(id),
        uninstall,
        enable,
        servers: () => servers,
        server_state: () => states,
        add_server: async (url, name) => {
            url = url.trim();
            if (!url) return false;
            try { base_of(url); } catch (e) { NOTIFY('invalid url', 'error'); return false; }
            if (servers.some(s => s.url === url)) { NOTIFY('that server is already in the list', 'warning'); return false; }
            const config: ServerConfig = { url, name: (name || '').trim() || new URL(url, location.href).host || url, enabled: true };
            const state = await load_server(config);
            if (state.status !== 'online') {
                const ok = await CONFIRM(`The server does not answer (${state.error}). Add it anyway?`, { title: 'server', ok: 'add' });
                if (!ok) return false;
            }
            servers.push(config);
            save_servers();
            await refresh();
            NOTIFY(`server ${config.name} added (${state.extensions.length} extensions)`, 'success');
            return true;
        },
        remove_server: (url) => {
            servers = servers.filter(s => s.url !== url);
            save_servers();
            refresh();
        },
        toggle_server: (url) => {
            const s = servers.find(x => x.url === url);
            if (!s) return;
            s.enabled = !s.enabled;
            save_servers();
            refresh();
        },
        installed: () => installed,
    };

    // Run the installed extensions, then load the servers
    Object.keys(installed).forEach(activate);
    refresh().then(async () => {
        // First visit: install the default extensions of the servers
        if (first_run) {
            const defaults = catalog().filter(e => e.default && e.server.builtin);
            for (const e of defaults) await install(e.id, true);
            // Servers offline: try again on the next visit
            if (!defaults.length && catalog().length) save_installed();
            else NOTIFY(`${defaults.length} extensions installed: ${defaults.map(d => d.name).join(', ')}`, 'info', 6000);
        }
        HUB.emit('ready');
    });
});
