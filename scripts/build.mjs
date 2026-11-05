/* =========================================================================
    SpimHub - build

        src/index.html                     ->  docs/index.html
        src/scss/style.scss                ->  docs/style.css
        src/vendor/*.js                    ┐
        src/ts/engine (bundled)            ├─> docs/script.js
        src/examples/*.asm (embedded)      │
        src/ts/app (GUI scripts)           ┘
        src/img/*                          ->  docs/img/*

        src/ts/engine/spim.ts                ->  dist/spim.cjs   (tests)
        src/ts/cli/spimhub.ts              ->  dist/cli.cjs    (bin/spimhub.js)

    docs/ is the GitHub Pages deploy: only these files, nothing else.

        node scripts/build.mjs             build everything
        node scripts/build.mjs --watch     rebuild on changes
 ========================================================================== */

import * as esbuild from 'esbuild';
import * as sass from 'sass';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DOCS = path.join(ROOT, 'docs');
const DIST = path.join(ROOT, 'dist');

const TARGET = 'es2020';

// Concatenation order of docs/script.js (classic scripts sharing the global scope)
const VENDOR = ['file_saver.js', 'lzma_worker.js', 'html2canvas.js'];
const APP = [
    'lang/mips.ts', 'lang/riscv.ts', 'format.ts', 'ux.ts', 'index.ts',
    'finder.ts', 'search.ts', 'dnd.ts', 'runner.ts', 'pipeline.ts', 'terminal.ts',
    'settings.ts', 'extensions.ts',
];
const IMAGES = /\.(png|ico|svg|jpe?g|gif|webp)$/i;

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;

// ---------------- docs/style.css ----------------
const buildCss = () => sass.compile(path.join(SRC, 'scss', 'style.scss'), {
    style: 'compressed',
    silenceDeprecations: ['import'],
}).css;

// ---------------- docs/script.js ----------------
const buildJs = async () => {
    const parts = [];

    // Third party libraries (kept as they are, with their licenses)
    VENDOR.forEach(f => parts.push(`/* ==== src/vendor/${f} ==== */\n${read(SRC, 'vendor', f)}`));

    // Engine: ES modules bundled in an IIFE that defines the global SPIM
    const engine = await esbuild.build({
        entryPoints: [path.join(SRC, 'ts', 'engine', 'browser.ts')],
        bundle: true, format: 'iife', target: TARGET, write: false, legalComments: 'none',
    });
    parts.push(`/* ==== src/ts/engine ==== */\n${engine.outputFiles[0].text}`);

    // Example programs: { 'mips/hello.asm': '...', 'riscv/hello.asm': '...' }
    const examples = {};
    const walk = (dir) => fs.readdirSync(path.join(SRC, 'examples', dir), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(d => {
            const rel = dir ? `${dir}/${d.name}` : d.name;
            if (d.isDirectory()) walk(rel);
            else if (d.name.endsWith('.asm')) examples[rel] = read(SRC, 'examples', rel);
        });
    walk('');
    parts.push(`/* ==== src/examples ==== */\nconst EXAMPLES_FILES = ${JSON.stringify(examples)};`);

    // GUI: each file is a classic script, types are stripped and the global
    // declarations are kept (index.html calls them from javascript: links)
    for (const f of APP) {
        const out = await esbuild.transform(read(SRC, 'ts', 'app', f), {
            loader: 'ts', target: TARGET, sourcefile: `src/ts/app/${f}`,
        });
        parts.push(`/* ==== src/ts/app/${f} ==== */\n${out.code}`);
    }

    // Minify whitespace + syntax only: the global names must survive
    const min = await esbuild.transform(parts.join('\n;\n'), {
        loader: 'js', target: TARGET,
        minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
        legalComments: 'inline',
    });
    return min.code;
};

// ---------------- docs/ ----------------
const buildDocs = async () => {
    const [css, js] = [buildCss(), await buildJs()];

    // Cache busting for GitHub Pages
    const html = read(SRC, 'index.html')
        .replace('href="./style.css"', `href="./style.css?v=${hash(css)}"`)
        .replace('src="./script.js"', `src="./script.js?v=${hash(js)}"`);

    fs.rmSync(DOCS, { recursive: true, force: true });
    fs.mkdirSync(path.join(DOCS, 'img'), { recursive: true });
    fs.writeFileSync(path.join(DOCS, 'index.html'), html);
    fs.writeFileSync(path.join(DOCS, 'style.css'), css);
    fs.writeFileSync(path.join(DOCS, 'script.js'), js);

    const images = fs.readdirSync(path.join(SRC, 'img')).filter(f => IMAGES.test(f));
    images.forEach(f => fs.copyFileSync(path.join(SRC, 'img', f), path.join(DOCS, 'img', f)));

    console.log(`docs/index.html  ${kb(html)}`);
    console.log(`docs/style.css   ${kb(css)}`);
    console.log(`docs/script.js   ${kb(js)}`);
    console.log(`docs/img/        ${images.length} images`);
};

// ---------------- dist/ (node) ----------------
const buildDist = async () => {
    fs.mkdirSync(DIST, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(SRC, 'ts', 'engine', 'spim.ts')],
        outfile: path.join(DIST, 'spim.cjs'),
        bundle: true, platform: 'node', format: 'cjs', target: 'node18',
        footer: { js: 'module.exports = module.exports.default;' },
    });
    await esbuild.build({
        entryPoints: [path.join(SRC, 'ts', 'cli', 'spimhub.ts')],
        outfile: path.join(DIST, 'cli.cjs'),
        bundle: true, platform: 'node', format: 'cjs', target: 'node18',
    });
    console.log('dist/spim.cjs, dist/cli.cjs');
};

const build = async () => {
    const t0 = Date.now();
    try {
        await Promise.all([buildDocs(), buildDist()]);
        console.log(`built in ${Date.now() - t0}ms`);
        return true;
    } catch (e) {
        console.error(e.message || e);
        return false;
    }
};

if (process.argv.includes('--watch')) {
    await build();
    let timer = null;
    fs.watch(SRC, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(build, 100);
    });
    console.log('watching src/ ...');
} else if (!(await build())) {
    process.exit(1);
}
