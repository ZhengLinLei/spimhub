/* =========================================================================
    SpimHub - A MIPS / RISC-V Assembly IDE for Web Browsers

    Path: src/ts/app/dnd.ts

    Drag & drop:
        computer → SpimHub      .asm / .s / .txt files and folders are imported
                                into the folder under the cursor (or the
                                current one); a .spim project is opened
        explorer → folder       move files and folders
        explorer → editor       open the file in that window
        tab      → tab bar      reorder the tabs
        tab      → window       move the file to another window

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

interface DndApi {
    move_file(from: string, name: string, to: string): boolean;
    move_folder(route: string, to: string): boolean;
    import_files(files: { path: string; content: string }[], target: string): number;
}

let DND: DndApi;

window.addEventListener('load', () => {

    const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const MIME = 'application/x-spimhub';
    const TEXT = /\.(asm|s|S|mips|rv|inc|txt|md)$/;
    const PROJECT = new RegExp(`\\.(${PROJECT_VARNAME.extension.join('|')})$`);

    const zone = $('#drop-zone');
    const zone_text = zone.querySelector('.drop-text');

    const refresh = () => {
        ROOT_DIR.clean_gui('/');
        ROOT_DIR.get_dir_gui('/');
        SAVE_FILE_SYSTEM();
        SAVE_EDITOR_DATA();
    };
    const editors = () => Object.values(WINDOW_EDITOR.files).flat();
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_\-.]/g, '_');

    // ================== //
    //  Move              //
    // ================== //
    const move_file = (from: string, name: string, to: string): boolean => {
        if (from === to || !FILE_SYSTEM[from] || !FILE_SYSTEM[to]) return false;
        const f = FILE_SYSTEM[from].files[name];
        if (!f) return false;
        if (FILE_SYSTEM[to].files[name]) { NOTIFY(`[${to}${name}] already exists`, 'error'); return false; }
        delete FILE_SYSTEM[from].files[name];
        f.route = to;
        FILE_SYSTEM[to].files[name] = f;
        FILE_SYSTEM[to].active = true;
        editors().forEach(m => {
            if (m.route === from && m.name === name) {
                m.route = to;
                m.__fw.setAttribute('route', `~${to}${name}`);
                m.__fw.title = `${to}${name}`;
            }
        });
        refresh();
        NOTIFY(`moved ${name} → ${to}`, 'success', 2500);
        return true;
    };

    const move_folder = (route: string, to: string): boolean => {
        const name = route.split('/').slice(-2)[0];
        const parent = route.split('/').slice(0, -2).join('/') + '/';
        const target = `${to}${name}/`;
        if (route === '/' || parent === to || !FILE_SYSTEM[route] || !FILE_SYSTEM[to]) return false;
        if (to.startsWith(route)) { NOTIFY('a folder cannot be moved inside itself', 'error'); return false; }
        if (FILE_SYSTEM[target]) { NOTIFY(`[${target}] already exists`, 'error'); return false; }

        FILE_SYSTEM[parent].folders = FILE_SYSTEM[parent].folders.filter(f => f && f !== name);
        FILE_SYSTEM[to].folders.push(name);
        FILE_SYSTEM[to].active = true;
        Object.keys(FILE_SYSTEM).filter(k => k.startsWith(route)).forEach(k => {
            const nk = target + k.slice(route.length);
            const folder = FILE_SYSTEM[k];
            Object.values(folder.files).forEach(file => { file.route = nk; });
            FILE_SYSTEM[nk] = folder;
            delete FILE_SYSTEM[k];
        });
        editors().forEach(m => {
            if (m.route.startsWith(route)) {
                m.route = target + m.route.slice(route.length);
                m.__fw.setAttribute('route', `~${m.route}${m.name}`);
                m.__fw.title = `${m.route}${m.name}`;
            }
        });
        refresh();
        NOTIFY(`moved [${name}] → ${to}`, 'success', 2500);
        return true;
    };

    // ================== //
    //  Import            //
    // ================== //
    const mkdirs = (base: string, dirs: string[]): string => {
        let route = base;
        dirs.forEach(d => {
            d = sanitize(d);
            const next = `${route}${d}/`;
            if (!FILE_SYSTEM[next]) {
                FILE_SYSTEM[next] = { name: `[${d}]`, files: {}, folders: [], active: true };
                FILE_SYSTEM[route].folders.push(d);
            }
            route = next;
        });
        return route;
    };

    const unique = (route: string, name: string) => {
        if (!FILE_SYSTEM[route].files[name]) return name;
        const dot = name.lastIndexOf('.');
        const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
        let i = 1;
        while (FILE_SYSTEM[route].files[`${base}-${i}${ext}`]) i++;
        return `${base}-${i}${ext}`;
    };

    /**
     * Imports text files ({ path: 'folder/file.asm', content }) into `target`
     */
    const import_files = (files: { path: string; content: string }[], target: string): number => {
        let first: FSFile | null = null;
        files.forEach(({ path, content }) => {
            const parts = path.split('/').filter(Boolean);
            const name = sanitize(parts.pop());
            const route = mkdirs(target, parts);
            const n = unique(route, name);
            FILE_SYSTEM[route].files[n] = { name: n, route, content };
            first = first || FILE_SYSTEM[route].files[n];
        });
        if (!files.length) return 0;
        refresh();
        if (first) open_file(first);
        NOTIFY(`${files.length} file${files.length === 1 ? '' : 's'} imported into ${target}`, 'success');
        return files.length;
    };

    // Reads the dropped items (folders included, when the browser supports it)
    const read_drop = async (dt: DataTransfer) => {
        const out: { path: string; file: File }[] = [];
        const walk = (entry: any, path: string): Promise<void> => new Promise(resolve => {
            if (!entry) return resolve();
            if (entry.isFile) entry.file((f: File) => { out.push({ path: path + f.name, file: f }); resolve(); }, () => resolve());
            else if (entry.isDirectory) {
                const reader = entry.createReader();
                const all: any[] = [];
                const read = () => reader.readEntries(async (batch: any[]) => {
                    if (batch.length) { all.push(...batch); read(); return; }
                    for (const e of all) await walk(e, `${path}${entry.name}/`);
                    resolve();
                }, () => resolve());
                read();
            } else resolve();
        });
        // The DataTransfer is only valid during the event: read everything before the first await
        const items = [...(dt.items || [])].filter(i => i.kind === 'file');
        const entries = items.map(i => typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null).filter(Boolean);
        const files = [...(dt.files || [])];
        for (const entry of entries) await walk(entry, '');
        if (!out.length) files.forEach(f => out.push({ path: f.name, file: f }));
        return out;
    };

    const drop_target_folder = (target: Element | null): string => {
        const folder = target?.closest('.explorer-folder');
        if (folder && folder.closest('#file-manager')) return folder.getAttribute('route') || '/';
        return FILE_SYSTEM[ROOT_DIR.cd] ? ROOT_DIR.cd : '/';
    };

    // ================== //
    //  Computer → app    //
    // ================== //
    let depth = 0;
    const has_files = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const popup_open = () => !!document.querySelector('#extra-pop-up .open-project.active');

    window.addEventListener('dragenter', (e) => {
        if (!has_files(e) || popup_open()) return;
        depth++;
        zone.classList.add('active');
    });
    window.addEventListener('dragleave', (e) => {
        if (!has_files(e) || popup_open()) return;
        depth = Math.max(0, depth - 1);
        if (!depth) zone.classList.remove('active');
    });
    window.addEventListener('dragover', (e) => {
        if (!has_files(e) || popup_open()) return;
        e.preventDefault();
        // The zone does not catch the events: the element under the cursor decides the folder
        zone.classList.add('active');
        const under = document.elementsFromPoint(e.clientX, e.clientY).find(x => !zone.contains(x)) || null;
        document.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
        under?.closest('.explorer-folder')?.querySelector(':scope > .x-folder')?.classList.add('drop-over');
        zone_text.textContent = `.asm files and folders → ${drop_target_folder(under)}   ·   .spim project → open it`;
    });
    window.addEventListener('drop', async (e) => {
        if (!has_files(e) || popup_open()) return;
        e.preventDefault();
        depth = 0;
        zone.classList.remove('active');
        document.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
        const under = document.elementsFromPoint(e.clientX, e.clientY).find(x => !zone.contains(x)) || null;
        const target = drop_target_folder(under);
        const dropped = await read_drop(e.dataTransfer);

        const project = dropped.find(d => PROJECT.test(d.file.name));
        if (project) {
            const ok = await CONFIRM(`Open the project "${project.file.name}"? The current project will be replaced (download it first with [save project] if you need it).`,
                { title: 'open project', ok: 'open', danger: true });
            if (!ok) return;
            const text = await project.file.text();
            localStorage.removeItem(PROJECT_VARNAME.editor);
            localStorage.setItem(PROJECT_VARNAME.filesystem, text);
            location.reload();
            return;
        }

        const texts = dropped.filter(d => TEXT.test(d.file.name) && d.file.size < 2 * 1024 * 1024);
        const skipped = dropped.length - texts.length;
        const files = await Promise.all(texts.map(async d => ({ path: d.path, content: await d.file.text() })));
        import_files(files, target);
        if (skipped) NOTIFY(`${skipped} file${skipped === 1 ? '' : 's'} skipped (only text files: .asm .s .txt ...)`, 'warning');
    });

    // ================== //
    //  Explorer          //
    // ================== //
    type Payload = { type: 'file' | 'folder' | 'tab'; route: string; name?: string; window?: number };
    let dragging: Payload | null = null;
    const manager = $('#file-manager');

    manager.addEventListener('dragstart', (e) => {
        const a = (e.target as Element).closest<HTMLElement>('.x-file, .x-folder');
        if (!a) return;
        if (a.classList.contains('x-file')) dragging = { type: 'file', route: a.dataset.route, name: a.dataset.name };
        else dragging = { type: 'folder', route: a.parentElement.getAttribute('route') };
        e.dataTransfer.setData(MIME, JSON.stringify(dragging));
        e.dataTransfer.setData('text/plain', dragging.route + (dragging.name || ''));
        e.dataTransfer.effectAllowed = 'move';
        a.classList.add('dragging');
    });
    document.addEventListener('dragend', () => {
        dragging = null;
        document.querySelectorAll('.dragging, .drop-over, .drop-before').forEach(x => x.classList.remove('dragging', 'drop-over', 'drop-before'));
    });

    const folder_at = (t: Element): string | null => {
        if (t.closest('.explorer-main-layer')) return '/';
        const folder = t.closest('.explorer-folder');
        return folder ? folder.getAttribute('route') : null;
    };

    manager.addEventListener('dragover', (e) => {
        if (!dragging || dragging.type === 'tab') return;
        const route = folder_at(e.target as Element);
        if (!route) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.drop-over').forEach(x => x.classList.remove('drop-over'));
        const label = (e.target as Element).closest('.explorer-folder')?.querySelector(':scope > .x-folder');
        (label || $('#x-root'))?.classList.add('drop-over');
    });
    manager.addEventListener('drop', (e) => {
        if (!dragging || dragging.type === 'tab') return;
        const route = folder_at(e.target as Element);
        if (!route) return;
        e.preventDefault();
        const d = dragging;
        dragging = null;
        if (d.type === 'file') move_file(d.route, d.name, route);
        else move_folder(d.route, route);
    });

    // ================== //
    //  Editor windows    //
    // ================== //
    const editor = $('#main-editor');
    const window_index = (w: Element) => WINDOW_EDITOR.windows.indexOf(w as HTMLElement);
    const meta_of_tab = (tab: Element): [number, EditorFile] | null => {
        for (const [key, list] of Object.entries(WINDOW_EDITOR.files)) {
            const m = list.find(x => x.__fw === tab);
            if (m) return [+key.slice(1), m];
        }
        return null;
    };

    editor.addEventListener('dragstart', (e) => {
        const tab = (e.target as Element).closest<HTMLElement>('.file-queue > div');
        if (!tab) return;
        const found = meta_of_tab(tab);
        if (!found) return;
        dragging = { type: 'tab', route: found[1].route, name: found[1].name, window: found[0] };
        e.dataTransfer.setData(MIME, JSON.stringify(dragging));
        e.dataTransfer.effectAllowed = 'move';
        tab.classList.add('dragging');
    });

    editor.addEventListener('dragover', (e) => {
        if (!dragging) return;
        const w = (e.target as Element).closest('.editor-window');
        if (!w) return;
        e.preventDefault();
        document.querySelectorAll('.drop-over, .drop-before').forEach(x => x.classList.remove('drop-over', 'drop-before'));
        const tab = (e.target as Element).closest('.file-queue > div');
        if (dragging.type === 'tab' && tab) tab.classList.add('drop-before');
        else w.classList.add('drop-over');
    });

    editor.addEventListener('drop', (e) => {
        if (!dragging) return;
        const w = (e.target as Element).closest('.editor-window');
        if (!w) return;
        e.preventDefault();
        const d = dragging;
        dragging = null;
        const wi = window_index(w);
        if (wi < 0) return;

        if (d.type === 'file') {
            const file = FILE_SYSTEM[d.route]?.files[d.name];
            if (!file) return;
            WINDOW_EDITOR.active = wi;
            open_file(file);
            return;
        }
        if (d.type !== 'tab') return;
        const found = WINDOW_EDITOR.files[`w${d.window}`].find(m => m.route === d.route && m.name === d.name);
        if (!found) return;

        const tab = (e.target as Element).closest('.file-queue > div');
        if (d.window === wi) {
            // Reorder inside the same window
            if (!tab || tab === found.__fw) return;
            const list = WINDOW_EDITOR.files[`w${wi}`];
            list.splice(list.indexOf(found), 1);
            const target = meta_of_tab(tab)?.[1];
            list.splice(target ? list.indexOf(target) : list.length, 0, found);
            tab.parentElement.insertBefore(found.__fw, tab);
            SAVE_EDITOR_DATA();
            return;
        }
        // Move to another window (unsaved changes included)
        if (WINDOW_EDITOR.files[`w${wi}`].some(m => m.route === found.route && m.name === found.name)) {
            NOTIFY(`${found.name} is already open in that window`, 'warning');
            return;
        }
        const content = found.content;
        const dirty = found.__fw.classList.contains('not-saved');
        WINDOW_EDITOR.active = wi;
        create_file(found.file, wi);
        const moved = WINDOW_EDITOR.files[`w${wi}`].find(m => m.route === found.route && m.name === found.name);
        if (moved && dirty) {
            const ta = moved.__f.querySelector('textarea');
            ta.value = content;
            update_code(ta, moved, moved.file);
        }
        // Close the original without asking (the changes moved with it)
        found.__fw.classList.remove('not-saved');
        found.__fw.querySelector<HTMLElement>('a.muted')?.click();
    });

    DND = { move_file, move_folder, import_files };
});
