// Instruction mix: the dynamic instruction count of the last run, by class
// and by mnemonic, with the CPI of the 5 stage pipeline.
// Data: spimhub.spim.trace (every executed instruction) and spimhub.spim.pipeline

const KINDS = {
    alu: 'ALU', mul: 'mul / div', fpu: 'float', load: 'load', store: 'store',
    branch: 'branch', jump: 'jump', jumpr: 'jump register', syscall: 'syscall', nop: 'nop', other: 'other',
};
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const analyze = () => {
    const spim = spimhub.spim;
    const trace = spim.trace;
    if (!trace.length) return null;
    const kinds = {}, ops = {};
    let taken = 0, branches = 0;
    trace.forEach(e => {
        kinds[e.deps.kind] = (kinds[e.deps.kind] || 0) + 1;
        const op = e.basic.split(' ')[0];
        ops[op] = (ops[op] || 0) + 1;
        if (e.deps.kind === 'branch') { branches++; if (e.taken) taken++; }
    });
    return {
        total: trace.length, kinds, ops, taken, branches,
        limited: trace.length >= spim.traceLimit,
        stats: spim.pipeline.stats(),
        arch: spim.archLabel,
    };
};

const bars = (entries, total) => entries.map(([name, n]) => {
    const pct = (100 * n / total);
    return `<tr><td>${escape(name)}</td><td class="mix-n">${n}</td>
        <td class="mix-bar"><i style="width:${pct.toFixed(1)}%"></i></td><td class="muted">${pct.toFixed(1)}%</td></tr>`;
}).join('');

const panel = spimhub.panel('instruction mix');
const render = () => {
    const r = analyze();
    if (!r) { panel.innerHTML = '<p class="muted mix-empty">Run a program to see its instruction mix.</p>'; return r; }
    const kinds = Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => [KINDS[k] || k, n]);
    const ops = Object.entries(r.ops).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const s = r.stats;
    panel.innerHTML = `
        <div class="mix">
            <p><b>${r.total}</b> instructions executed (${escape(r.arch)})${r.limited ? ' <span class="text-error">(trace limit)</span>' : ''} ·
               CPI <b>${s.cpi.toFixed(2)}</b> · ${s.stalls} stalls · ${s.flushes} flushes ·
               branches taken ${r.branches ? Math.round(100 * r.taken / r.branches) : 0}%</p>
            <div class="mix-cols">
                <div><h4>[by class]</h4><table>${bars(kinds, r.total)}</table></div>
                <div><h4>[top instructions]</h4><table>${bars(ops, r.total)}</table></div>
            </div>
            <p class="muted">Loads and taken branches are the usual sources of stalls and flushes: compare this with the [pipeline] view.</p>
        </div>`;
    return r;
};

const status = spimhub.status('[mix]', () => { render(); spimhub.open(); }, 'Instruction mix of the last run');

const update = () => {
    const r = render();
    if (r) status.set(`[mix ${r.total}]`);
};
spimhub.on('exit', update);
spimhub.on('error', update);
spimhub.on('assemble', () => status.set('[mix]'));

spimhub.command('mix', 'instruction mix of the last run', (args, term) => {
    const r = analyze();
    if (!r) { term.print('mix: run a program first', 'text-error'); return; }
    term.print(`${r.total} instructions, CPI ${r.stats.cpi.toFixed(2)}`);
    Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
        term.print(`${(KINDS[k] || k).padEnd(14)} ${String(n).padStart(7)}  ${'█'.repeat(Math.round(30 * n / r.total))}`));
});
spimhub.palette('instruction mix: show', () => { render(); spimhub.open(); });

render();
