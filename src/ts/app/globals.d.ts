/* =========================================================================
    SpimHub - globals shared by the GUI scripts (src/ts/app)

    The GUI files are classic scripts concatenated into docs/script.js, so
    their top level declarations are shared (and used by the inline
    `javascript:` links of index.html).
 ========================================================================== */

// Engine (src/ts/spim/browser.ts)
declare const SPIM: typeof import('../spim/spim').default;
type SPIMInstance = import('../spim/spim').default;

// Example programs, injected by scripts/build.mjs from src/examples/*.asm
declare const EXAMPLES_FILES: Record<string, string>;

// Vendor libraries (src/vendor)
declare function saveAs(data: Blob, filename?: string): void;
declare function html2canvas(element: HTMLElement, options?: object): Promise<HTMLCanvasElement>;
declare const LZMA: {
    compress(data: string | number[], mode: number, cb: (result: number[], error?: unknown) => void): void;
    decompress(data: number[], cb: (result: string, error?: unknown) => void): void;
};

// Syntax highlighter scope (src/ts/app/lang/mips.ts -> src/ts/app/format.ts)
interface LangScope {
    meta: string[];
    builtin: string[];
    keywords: RegExp;
    comments: RegExp;
    contains: {
        regexDynamic: { number: RegExp; string: RegExp; char: RegExp };
        regexStatic: { punctuation: RegExp; operator: RegExp };
    };
}

// ================== //
//  Virtual filesystem (FSPath-1.0)
// ================== //
interface FSFile {
    name: string;
    route: string;
    content: string;
}
interface FSFolder {
    name: string;
    files: Record<string, FSFile>;
    folders: string[];
    active?: boolean;
}

// File opened in an editor window
interface EditorFile {
    name: string;
    route: string;
    content: string;
    active: boolean;
    __fw: HTMLElement;      // Tab in the file queue
    __f: HTMLElement;       // Editor (line numbers + textarea + highlighted code)
    file: FSFile;
}

interface WindowEditor {
    parent: HTMLElement;
    max: number;
    min: number;
    current: number;
    active: number;
    label: string;
    windows: (HTMLElement | null)[];
    files: Record<string, EditorFile[]>;
}
