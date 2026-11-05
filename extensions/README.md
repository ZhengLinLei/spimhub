# SpimHub extension server

This folder **is** an extension server: any HTTP server (GitHub, GitHub Pages, nginx, `npx serve`...)
that publishes it can be added in SpimHub → `[settings]` → `[extension servers]`.

```
extensions/
├── index.json              list of extensions of the server
├── confetti/
│   ├── manifest.json
│   ├── main.js
│   ├── style.css
│   └── README.md
└── ...
```

The server must allow CORS (`Access-Control-Allow-Origin: *`) when SpimHub runs on another origin
(GitHub raw does; the Docker image adds it for `/extensions/`).

## index.json

```json
{
    "name": "My server",
    "description": "Extensions for my course",
    "version": 1,
    "extensions": [
        {
            "id": "my-extension",
            "name": "My extension",
            "version": "1.0.0",
            "description": "What it does",
            "author": "Me",
            "path": "my-extension/",
            "icon": "🧪",
            "tags": ["learning"],
            "default": false
        }
    ]
}
```

- `id`: lowercase letters, numbers, `.`, `_`, `-` (it must match the manifest).
- `version`: when it is greater than the installed one, SpimHub shows `[update]`.
- `default`: installed on the first visit (only from the default servers).

## manifest.json

```json
{
    "id": "my-extension",
    "name": "My extension",
    "version": "1.0.0",
    "description": "What it does",
    "author": "Me",
    "license": "MIT",
    "main": "main.js",
    "styles": "style.css",
    "readme": "README.md",
    "engines": { "spimhub": ">=1.1.0" },
    "contributes": { "commands": ["hello"] }
}
```

`main` and `styles` are optional (a theme can be only CSS: see `theme-dracula`). `contributes` is
informative. The files are downloaded once and saved in `localStorage`: the extension runs on every
start, also offline.

## main.js

A plain script (no `import`). It receives the `spimhub` object:

```js
// Events: ready, assemble, run, step, exit, error, output, file-open, file-save, theme
spimhub.on('exit', (e) => spimhub.notify(`exit code ${e.code} after ${e.steps} instructions`));

// Terminal command and command palette (Ctrl + Shift + P)
spimhub.command('hello', 'says hello', (args, term) => term.print(`hello ${args.join(' ')}`));
spimhub.palette('my extension: say hello', () => spimhub.notify('hello!', 'success'));

// UI
spimhub.css('.my-box { color: red; }');                 // removed when the extension is disabled
const box = spimhub.element('div');                     // element in <body>
const item = spimhub.status('[0]', () => {}, 'title');  // status bar item: item.set('[1]')
const panel = spimhub.panel('my panel');                // panel in the page of the extension
spimhub.notify('text', 'info' | 'success' | 'warning' | 'error');
await spimhub.confirm('Are you sure?');
spimhub.log('in the [console] tab');

// Data saved per extension
spimhub.storage.set('count', 1);
spimhub.storage.get('count', 0);

// Simulator and editor
spimhub.spim                    // engine: program, cpu (registers, memory), trace, pipeline
spimhub.runner.run();           // assemble + run the active file (also assemble, step, reset)
spimhub.editor.active();        // { name, route, content, arch }
spimhub.editor.insert('nop\n'); // at the cursor (undo works)
spimhub.editor.create('new.asm', 'main: ...', '/');

spimhub.onDispose(() => { /* clean timers, listeners on window... */ });
```

Everything created through the API (listeners, commands, styles, elements, status items, panels) is
removed automatically when the extension is disabled or uninstalled.

**Security:** extensions run JavaScript inside the page with access to the project. SpimHub asks for
confirmation before installing from a server that is not a default one.

## Extensions of this server

| | id | |
| --- | --- | --- |
| 🐾 | `pet` | the SpimHub creature reacts to your programs and gives tips (default) |
| 🎉 | `confetti` | confetti when a program exits with code 0 (default) |
| 🔢 | `converter` | decimal / hex / binary / two's complement / IEEE-754 (default) |
| 📊 | `instruction-mix` | dynamic instruction count by class, CPI |
| ✂️ | `snippets` | MIPS / RISC-V snippets from the command palette |
| 🔊 | `retro-sounds` | 8-bit sounds for success and errors |
| 🧛 | `theme-dracula` | Dracula palette for the dark theme (CSS only) |
