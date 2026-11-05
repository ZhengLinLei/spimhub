// Number converter: one 32-bit word seen in every way
//   conv 42 | conv -1 | conv 0x7fffffff | conv 0b1010 | conv 'A' | conv 3.5 (float bits)

const buf = new DataView(new ArrayBuffer(4));

// Text -> 32-bit word
const parse = (text) => {
    const s = String(text).trim();
    if (!s) return null;
    let m;
    if ((m = /^'(.)'$/.exec(s))) return m[1].charCodeAt(0);
    if (/^[-+]?0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s.replace(/^([-+]?)0x/i, '$1'), 16) | 0;
    if (/^[-+]?0b[01]+$/i.test(s)) return Number.parseInt(s.replace(/^([-+]?)0b/i, '$1'), 2) | 0;
    if (/^[-+]?\d+$/.test(s)) {
        const n = Number(s);
        if (n > 0xffffffff || n < -0x80000000) return null;
        return n | 0;
    }
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+e[-+]?\d+|inf|nan)$/i.test(s)) {
        buf.setFloat32(0, /inf/i.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : Number(s));
        return buf.getInt32(0);
    }
    return null;
};

const hex = (w) => '0x' + (w >>> 0).toString(16).padStart(8, '0');
const bin = (w) => (w >>> 0).toString(2).padStart(32, '0').replace(/(.{4})(?=.)/g, '$1 ');
const ascii = (w) => [0, 8, 16, 24].map(sh => {
    const c = (w >>> sh) & 0xff;
    return c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
}).join('');

// Rows of the conversion table
const rows = (w) => {
    buf.setInt32(0, w);
    const f = buf.getFloat32(0);
    const sign = w >>> 31, exp = (w >>> 23) & 0xff, frac = w & 0x7fffff;
    return [
        ['hexadecimal', hex(w)],
        ['binary', bin(w)],
        ['signed (two\'s complement)', String(w | 0)],
        ['unsigned', String(w >>> 0)],
        ['IEEE-754 float', `${f}   sign ${sign} · exponent ${exp} (${exp - 127}) · fraction 0x${frac.toString(16)}`],
        ['bytes (little endian)', [0, 8, 16, 24].map(sh => ((w >>> sh) & 0xff).toString(16).padStart(2, '0')).join(' ')],
        ['ASCII (memory order)', ascii(w)],
        ['li', `li $t0, ${w | 0}      li t0, ${w | 0}`],
    ];
};

// ---- Terminal ----
spimhub.command('conv', 'convert a number: conv 42, conv 0xff, conv 0b101, conv \'A\', conv 3.5', (args, term) => {
    const w = parse(args.join(' '));
    if (w === null) { term.print('conv: write a decimal, 0x hex, 0b binary, \'c\' character or a float (3.5)', 'text-error'); return; }
    rows(w).forEach(([k, v]) => term.print(`${k.padEnd(26)} ${v}`));
}, '<number>');

// ---- Panel ----
const panel = spimhub.panel('converter');
panel.innerHTML = `
    <div class="conv">
        <input class="conv-input" placeholder="42, -1, 0xff, 0b1010, 'A', 3.5" spellcheck="false" value="-42">
        <table class="conv-table"></table>
        <p class="muted">Click a value to copy it.</p>
    </div>`;
const input = panel.querySelector('.conv-input');
const table = panel.querySelector('.conv-table');
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const render = () => {
    const w = parse(input.value);
    input.classList.toggle('invalid', w === null && !!input.value.trim());
    table.innerHTML = w === null ? '' : rows(w).map(([k, v]) => `<tr><td class="muted">[${k}]</td><td class="conv-value">${escape(v)}</td></tr>`).join('');
};
input.addEventListener('input', render);
table.addEventListener('click', (e) => {
    const td = e.target.closest('.conv-value');
    if (!td) return;
    navigator.clipboard?.writeText(td.textContent.split('   ')[0]);
    spimhub.notify('copied', 'success', 1200);
});
render();

spimhub.palette('converter: open', () => { spimhub.open(); setTimeout(() => input.focus(), 50); });
