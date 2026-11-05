/* =========================================================================
    SpimHub - extension server (extensions/) consistency tests

    Run: npm test
 ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'extensions');
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'index.json'), 'utf8'));

test('index.json lists valid extensions', () => {
    assert.ok(index.name);
    assert.ok(Array.isArray(index.extensions) && index.extensions.length > 0);
    const ids = new Set();
    index.extensions.forEach(e => {
        assert.match(e.id, ID, e.id);
        assert.ok(!ids.has(e.id), `duplicated id ${e.id}`);
        ids.add(e.id);
        ['name', 'version', 'description', 'path'].forEach(k => assert.ok(e[k], `${e.id}.${k}`));
        assert.ok(fs.existsSync(path.join(ROOT, e.path, 'manifest.json')), `${e.id}: manifest.json`);
    });
    assert.ok(index.extensions.some(e => e.default), 'at least one default extension');
});

test('every manifest matches the index and its files exist', () => {
    index.extensions.forEach(e => {
        const dir = path.join(ROOT, e.path);
        const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        assert.equal(m.id, e.id);
        assert.equal(m.version, e.version, `${e.id}: version in index.json and manifest.json`);
        assert.ok(m.main || m.styles, `${e.id}: main or styles`);
        ['main', 'styles', 'readme'].forEach(k => {
            if (m[k]) assert.ok(fs.existsSync(path.join(dir, m[k])), `${e.id}: ${m[k]}`);
        });
    });
});

test('extension code compiles and only uses the spimhub API it receives', () => {
    index.extensions.forEach(e => {
        const dir = path.join(ROOT, e.path);
        const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        if (!m.main) return;
        const code = fs.readFileSync(path.join(dir, m.main), 'utf8');
        // Same wrapper as src/ts/app/extensions.ts
        assert.doesNotThrow(() => new Function('spimhub', `"use strict";\n${code}`), e.id);
        assert.doesNotMatch(code, /^\s*import\s[^;]*\bfrom\b|\brequire\(/m, `${e.id}: no modules`);
    });
});
