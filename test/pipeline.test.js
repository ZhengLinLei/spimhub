/* =========================================================================
    SpimHub - 5 stage pipeline model tests (hazards, forwarding, flushes)

    Run: npm test
 ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SPIM = require('../dist/spim.cjs');

/**
 * Runs a program and returns its pipeline rows (real instructions only)
 * Startup code is disabled so row 0 is the first instruction of the source.
 */
const pipe = (src, options = {}, arch = 'riscv') => {
    const spim = new SPIM({});
    const p = spim.load(src, 'p.asm', { arch, startup: false });
    assert.deepEqual(p.errors, []);
    spim.setPipelineOptions({ forwarding: true, branchStage: 'EX', ...options });
    spim.run(1e5);
    const all = spim.pipeline.rows;
    return { spim, all, rows: all.filter(r => !r.flushed), stats: spim.pipeline.stats() };
};

const EXIT = { riscv: 'li a7, 10\necall', mips: 'li $v0, 10\nsyscall' };

test('independent instructions: one per cycle, CPI -> 1', () => {
    const { rows, stats } = pipe(`addi t0, zero, 1\naddi t1, zero, 2\naddi t2, zero, 3\n${EXIT.riscv}`);
    rows.forEach((r, i) => {
        assert.deepEqual([r.IF, r.ID, r.EX, r.MEM, r.WB], [i + 1, i + 2, i + 3, i + 4, i + 5]);
    });
    assert.equal(stats.stalls, 0);
    assert.equal(stats.cycles, rows.length + 4);   // fill + drain
});

test('RAW with forwarding: EX/MEM -> EX and MEM/WB -> EX, no stalls', () => {
    const { rows, stats } = pipe(`addi t0, zero, 1\nadd t1, t0, t0\nadd t2, t0, t0\n${EXIT.riscv}`);
    assert.equal(stats.stalls, 0);
    assert.equal(rows[1].forwards[0].path, 'EX/MEM → EX');
    assert.equal(rows[2].forwards[0].path, 'MEM/WB → EX');
});

test('RAW without forwarding: 2 stalls at distance 1, 1 at distance 2', () => {
    const { rows } = pipe(`addi t0, zero, 1\nadd t1, t0, t0\nnop\nadd t2, t1, t1\n${EXIT.riscv}`, { forwarding: false });
    assert.equal(rows[1].stalls, 2);
    assert.equal(rows[1].EX, rows[0].WB + 1);
    assert.equal(rows[3].stalls, 1);
});

test('load-use: 1 stall with forwarding, avoided by reordering', () => {
    const src = `
        .data
        x: .word 5
        .text
        la  a0, x
        lw  t0, 0(a0)
        add t1, t0, t0
        lw  t2, 0(a0)
        addi t3, zero, 1
        add t4, t2, t2
        ${EXIT.riscv}`;
    const { rows } = pipe(src);
    const use = rows.find(r => r.basic.startsWith('add x6'));
    assert.equal(use.stalls, 1);
    assert.equal(use.hazards[0].type, 'load-use');
    const reordered = rows.find(r => r.basic.startsWith('add x29'));
    assert.equal(reordered.stalls, 0);
});

test('store data is forwarded to MEM without stalls', () => {
    const { rows, stats } = pipe(`
        .data
        x: .word 5, 0
        .text
        la a0, x
        lw t0, 0(a0)
        sw t0, 4(a0)
        ${EXIT.riscv}`);
    const sw = rows.find(r => r.kind === 'store');
    assert.equal(sw.stalls, 0);
    assert.equal(sw.forwards.find(f => f.reg === 5).path, 'MEM/WB → MEM');
    assert.equal(stats.stalls, 0);
});

test('taken branch flushes 2 instructions in EX, 1 in ID', () => {
    const src = `li s0, 2\nloop: addi s0, s0, -1\nbnez s0, loop\n${EXIT.riscv}`;
    let r = pipe(src, { branchStage: 'EX' });
    assert.equal(r.stats.flushes, 2);
    const branch = r.rows.find(x => x.kind === 'branch');
    assert.equal(branch.hazards.find(h => h.type === 'control').stalls, 2);
    const next = r.rows[r.rows.indexOf(branch) + 1];
    assert.equal(next.IF, branch.EX + 1);

    r = pipe(src, { branchStage: 'ID' });
    assert.equal(r.stats.flushes, 1);
    // A branch in ID needs its operand one cycle earlier: 1 extra stall after addi
    const b2 = r.rows.find(x => x.kind === 'branch');
    assert.equal(b2.stalls, 1);
});

test('jumps are resolved in ID (1 flushed instruction)', () => {
    const { all } = pipe(`j skip\nnop\nnop\nskip: ${EXIT.riscv}`);
    assert.equal(all.filter(r => r.flushed).length, 1);
});

test('MIPS and RISC-V produce the same schedule for the same program', () => {
    const mips = pipe(`lw $t0, 0($sp)\nadd $t1, $t0, $t0\nsw $t1, 4($sp)\n${EXIT.mips}`, {}, 'mips');
    const rv = pipe(`lw t0, 0(sp)\nadd t1, t0, t0\nsw t1, 4(sp)\n${EXIT.riscv}`, {}, 'riscv');
    assert.deepEqual(mips.rows.map(r => [r.IF, r.EX, r.WB]), rv.rows.map(r => [r.IF, r.EX, r.WB]));
});

test('cycle view: stages, bubbles and stalls', () => {
    const { spim, rows } = pipe(`
        .data
        x: .word 5
        .text
        la  a0, x
        lw  t0, 0(a0)
        add t1, t0, t0
        ${EXIT.riscv}`);
    const lw = rows.find(r => r.kind === 'load');
    const add = rows.find(r => r.basic.startsWith('add x6'));
    // Cycle after the load enters EX: add is held in ID, EX gets a bubble
    const v = spim.pipeline.at(lw.MEM);
    assert.equal(v.stages.MEM.row, lw);
    assert.equal(v.stages.ID.row, add);
    assert.equal(v.stages.ID.state, 'stall');
    assert.equal(v.stages.EX.state, 'bubble');
    const v2 = spim.pipeline.at(add.EX);
    assert.equal(v2.forwards[0].path, 'MEM/WB → EX');
});

test('the trace records memory addresses and branches', () => {
    const { spim } = pipe(`
        .data
        x: .word 5
        .text
        la a0, x
        lw t0, 0(a0)
        beq zero, zero, end
        nop
        end: ${EXIT.riscv}`);
    const t = spim.trace;
    assert.equal(t.find(e => e.deps.kind === 'load').memAddr, 0x10010000);
    assert.equal(t.find(e => e.deps.kind === 'branch').taken, true);
});
