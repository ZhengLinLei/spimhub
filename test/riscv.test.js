/* =========================================================================
    SpimHub - RISC-V (RV32IM) assembler / simulator tests

    Run: npm test
 ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const SPIM = require('../dist/spim.cjs');

const { disassemble } = SPIM.RISCV;

const run = (src, input = [], options = {}) => {
    let out = '';
    const queue = [...input];
    const spim = new SPIM({ write: t => out += t, readLine: () => queue.length ? queue.shift() : null });
    const program = spim.load(src, 'test.asm', { arch: 'riscv', ...options });
    if (!program.ok) return { out, spim, program, res: null };
    const res = spim.run(1e6);
    return { out, spim, program, res, cpu: spim.cpu };
};

const words = (src) => {
    const p = new SPIM.Assembler('riscv').assemble(src, { startup: false });
    assert.deepEqual(p.errors, []);
    return p.text.map(t => t.word >>> 0);
};

const reg = (spim, name) => spim.cpu.r[SPIM.RISCV.XREG[name]];

test('encodes RV32IM like the specification', () => {
    const cases = [
        ['addi x1, x0, 1', 0x00100093],
        ['add x3, x1, x2', 0x002081b3],
        ['sub x3, x1, x2', 0x402081b3],
        ['lw x5, 8(x2)', 0x00812283],
        ['sw x5, 8(x2)', 0x00512423],
        ['lui x5, 0x12345', 0x123452b7],
        ['slli x5, x6, 3', 0x00331293],
        ['srai x5, x6, 3', 0x40335293],
        ['mul x5, x6, x7', 0x027302b3],
        ['ecall', 0x00000073],
        ['ebreak', 0x00100073],
        ['ret', 0x00008067],
        ['nop', 0x00000013],
        ['mv a0, s1', 0x00048513],
    ];
    cases.forEach(([src, w]) => assert.equal(words(src)[0], w >>> 0, src));
});

test('branch and jump offsets are pc relative', () => {
    const w = words(`
        a:  beq x1, x2, b
            nop
        b:  jal x1, b
            j a
    `);
    assert.equal(w[0], 0x00208463);    // +8
    assert.equal(w[2], 0x000000ef);    // jal x1, +0
    assert.equal(w[3], 0xff5ff06f);    // j -12
    assert.equal(disassemble(0x00208463, 0x00400000), 'beq x1, x2, 0x00400008');
    assert.equal(disassemble(0x00812283), 'lw x5, 8(x2)');
});

test('li / la expand to lui + addi with %hi / %lo', () => {
    assert.deepEqual(words('li t0, 5'), [0x00500293]);
    assert.deepEqual(words('li t0, 0x12345000'), [0x123452b7]);
    assert.equal(words('li t0, 0x12345fff').length, 2);
    const { spim } = run(`
        main:
            li  t0, 0x12345fff
            li  t1, -1
            li  t2, -2049
            lui t3, %hi(0x10010800)
            addi t3, t3, %lo(0x10010800)
            ret
    `);
    assert.equal(reg(spim, 't0') >>> 0, 0x12345fff);
    assert.equal(reg(spim, 't1'), -1);
    assert.equal(reg(spim, 't2'), -2049);
    assert.equal(reg(spim, 't3') >>> 0, 0x10010800);
});

test('arithmetic, RV32M and comparisons', () => {
    const { spim, res } = run(`
        main:
            li   t0, -7
            li   t1, 2
            div  s0, t0, t1         # -3 (round to zero)
            rem  s1, t0, t1         # -1
            divu s2, t0, t1
            div  s3, t0, zero       # -1 (division by zero)
            rem  s4, t0, zero       # dividend
            li   t2, 100000
            mul  s5, t2, t2         # low 32 bits
            mulh s6, t2, t2         # high 32 bits
            slt  s7, t0, t1
            sltu s8, t0, t1
            srai s9, t0, 1
            srli s10, t0, 28
            seqz s11, zero
            ret
    `);
    assert.equal(res.state, 'exited');
    assert.equal(reg(spim, 's0'), -3);
    assert.equal(reg(spim, 's1'), -1);
    assert.equal(reg(spim, 's2') >>> 0, 0x7ffffffc);
    assert.equal(reg(spim, 's3'), -1);
    assert.equal(reg(spim, 's4'), -7);
    assert.equal(reg(spim, 's5') >>> 0, 0x540be400);
    assert.equal(reg(spim, 's6'), 2);
    assert.equal(reg(spim, 's7'), 1);
    assert.equal(reg(spim, 's8'), 0);
    assert.equal(reg(spim, 's9'), -4);
    assert.equal(reg(spim, 's10'), 15);
    assert.equal(reg(spim, 's11'), 1);
});

test('memory, data directives and x0', () => {
    const { spim } = run(`
            .data
        b:  .byte -1, 2
        w:  .word 0x11223344
        s:  .asciz "ok"
            .text
        main:
            la   t0, b
            lb   s0, 0(t0)
            lbu  s1, 0(t0)
            lw   s2, w
            sw   s2, w, t3          # store with a temporary register
            sh   s0, 2(t0)
            lh   s3, 2(t0)
            addi zero, zero, 5
            ret
    `);
    assert.equal(reg(spim, 's0'), -1);
    assert.equal(reg(spim, 's1'), 255);
    assert.equal(reg(spim, 's2'), 0x11223344);
    assert.equal(reg(spim, 's3'), -1);
    assert.equal(reg(spim, 'zero'), 0);
});

test('syscalls use a7 and return in a0', () => {
    const { out, spim } = run(`
        main:
            li a7, 5
            ecall
            addi a0, a0, 1
            li a7, 1
            ecall
            li a0, 33
            li a7, 11
            ecall
            li a0, 4
            li a7, 93
            ecall
    `, ['41']);
    assert.equal(out, '42!');
    assert.equal(spim.cpu.exitCode, 4);
});

test('runtime errors and friendly assembler errors', () => {
    let r = run('main: lw t0, 0(zero)\n ret');
    assert.equal(r.res.state, 'error');
    assert.match(r.cpu.error, /Load access fault.*bad address/);
    r = run('main: li t0, 0x10010001\n lw t1, 0(t0)\n ret');
    assert.match(r.cpu.error, /unaligned/);

    const p = new SPIM.Assembler('riscv').assemble('addi t0, t0, 5000\nadd t0, t0, 5\nlw $t0, 0(sp)\nbeq t0, t1');
    const msg = p.errors.map(e => e.message).join('\n');
    assert.match(msg, /out of range \(-2048\.\.2047\)/);
    assert.match(msg, /use "addi" for an immediate/);
    assert.match(msg, /RISC-V registers have no "\$"/);
});

test('architecture detection', () => {
    assert.equal(SPIM.detectArch('li $v0, 4\nsyscall'), 'mips');
    assert.equal(SPIM.detectArch('li a7, 4\nla a0, msg\necall'), 'riscv');
    assert.equal(SPIM.detectArch('# arch: riscv\nnop'), 'riscv');
    assert.equal(SPIM.detectArch('# arch: mips\nnop'), 'mips');
    const spim = new SPIM({});
    spim.load('main: li a0, 1\n ret');
    assert.equal(spim.arch, 'riscv');
    assert.equal(spim.cpu.arch, 'riscv');
    spim.load('main: li $a0, 1\n jr $ra');
    assert.equal(spim.arch, 'mips');
});

test('bundled RISC-V examples run', () => {
    const dir = path.join(__dirname, '..', 'src', 'examples', 'riscv');
    const expected = {
        'hello.asm': [[], 'Hello, RISC-V!\n'],
        'factorial.asm': [['10'], 'Enter a number: 10! = 3628800\n'],
        'bubble_sort.asm': [[], '34 7 23 32 5 62 -4 18 0 11 \n-4 0 5 7 11 18 23 32 34 62 \n'],
    };
    Object.entries(expected).forEach(([file, [input, output]]) => {
        const { out, res } = run(fs.readFileSync(path.join(dir, file), 'utf8'), input, { arch: 'auto' });
        assert.equal(res.state, 'exited', file);
        assert.equal(out, output, file);
    });
    const fib = run(fs.readFileSync(path.join(dir, 'fibonacci.asm'), 'utf8'));
    assert.match(fib.out, /fib\(15\) = 610\n$/);
});
