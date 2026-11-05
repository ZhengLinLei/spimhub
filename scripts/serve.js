/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: scripts/serve.js

    Tiny static server for the built site (docs/), no dependencies.
    Production uses the Dockerfile (nginx) or GitHub Pages.

        npm start                 http://localhost:8080
        PORT=3000 npm start

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'docs');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.asm': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml',
};

http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.normalize(path.join(ROOT, url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

    fs.stat(file, (err, st) => {
        if (!err && st.isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(data);
        });
    });
}).listen(PORT, HOST, () => {
    console.log(`SpimHub running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
