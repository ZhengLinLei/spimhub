/* =========================================================================
    SpimHub - assembler / simulator tests

    Run: npm test
 ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const SPIM = require('../dist/spim.cjs');

const { disassemble } = SPIM.ISA;

/**
 * Assembles + runs a program, returns { out, spim, program, res }
 */
const run = (src, input = [], options = {}) => {
    let out = '';
    const queue = [...input];
    const spim = new SPIM({ write: t => out += t, readLine: () => queue.length ? queue.shift() : null });
    const program = spim.load(src, 'test.asm', options);
    if (!program.ok) return { out, spim, program, res: null };
    const res = spim.run(1e6);
    return { out, spim, program, res, cpu: spim.cpu };
};

const words = (src, options = { startup: false }) => {
    const p = new SPIM.Assembler().assemble(src, options);
    assert.deepEqual(p.errors, []);
    return p.text.map(t => t.word);
};

const reg = (spim, name) => spim.cpu.r[SPIM.ISA.GPR[name]];

// ============================================================
//  Encoding
// ============================================================
test('encodes real instructions like the MIPS32 reference', () => {
    const cases = [
        ['add $t0, $t1, $t2', 0x012a4020],
        ['addu $v0, $zero, $a0', 0x00041021],
        ['sub $s0, $s1, $s2', 0x02328022],
        ['addi $sp, $sp, -8', 0x23bdfff8],
        ['addiu $a0, $a0, 1', 0x24840001],
        ['andi $t0, $t0, 0xff', 0x310800ff],
        ['ori $t0, $zero, 0xffff', 0x3408ffff],
        ['lui $at, 0x1001', 0x3c011001],
        ['lw $t0, 4($sp)', 0x8fa80004],
        ['sw $ra, -4($fp)', 0xafdffffc],
        ['lb $t1, 0($a0)', 0x80890000],
        ['sll $t0, $t0, 2', 0x00084080],
        ['sra $t1, $t2, 31', 0x000a4fc3],
        ['sllv $t0, $t1, $t2', 0x01494004],
        ['jr $ra', 0x03e00008],
        ['jalr $ra, $t9', 0x0320f809],
        ['mult $a0, $a1', 0x00850018],
        ['div $t0, $t1', 0x0109001a],
        ['mfhi $t0', 0x00004010],
        ['mflo $v0', 0x00001012],
        ['slt $t0, $a0, $a1', 0x0085402a],
        ['sltiu $t0, $t1, 10', 0x2d28000a],
        ['syscall', 0x0000000c],
        ['nop', 0x00000000],
        ['mul $v0, $a0, $a1', 0x70851002],
        ['clz $t0, $t1', 0x71284020],
        ['add.s $f0, $f1, $f2', 0x46020800],
        ['mul.d $f4, $f6, $f8', 0x46283102],
        ['cvt.s.w $f0, $f0', 0x46800020],
        ['c.lt.s $f0, $f2', 0x4602003c],
        ['mfc1 $t0, $f12', 0x44086000],
        ['mtc1 $a0, $f12', 0x44846000],
        ['lwc1 $f0, 0($a0)', 0xc4800000],
        ['sdc1 $f2, 8($sp)', 0xf7a20008],
        ['mfc0 $k0, $13', 0x401a6800],
        ['eret', 0x42000018],
    ];
    cases.forEach(([src, w]) => {
        assert.equal(words(src)[0] >>> 0, w >>> 0, src);
    });
});

test('branches and jumps resolve labels', () => {
    const w = words(`
        start: beq $t0, $t1, end
               nop
        end:   bne $t0, $zero, start
               j start
               jal end
    `);
    assert.equal(w[0], 0x11090001);        // +1 word
    assert.equal(w[2] >>> 0, 0x1500fffd);  // -3 words
    assert.equal(w[3], 0x08100000);
    assert.equal(w[4], 0x0c100002);
});

test('disassembler round trips', () => {
    assert.equal(disassemble(0x012a4020), 'add $8, $9, $10');
    assert.equal(disassemble(0x8fa80004), 'lw $8, 4($29)');
    assert.equal(disassemble(0x46020800), 'add.s $f0, $f1, $f2');
    assert.equal(disassemble(0x08100000, 0x00400000), 'j 0x00400000');
    assert.equal(disassemble(0), 'nop');
});

// ============================================================
//  Pseudo instructions
// ============================================================
test('li chooses the shortest encoding', () => {
    assert.deepEqual(words('li $t0, 5'), [0x24080005]);
    assert.deepEqual(words('li $t0, -1'), [0x2408ffff]);
    assert.deepEqual(words('li $t0, 0xffff'), [0x3408ffff]);
    assert.deepEqual(words('li $t0, 0x10000'), [0x3c080001]);
    assert.deepEqual(words('li $t0, 0x12345678'), [0x3c011234, 0x34285678]);
});

test('pseudo instructions compute the right values', () => {
    const { spim, res } = run(`
        main:
            li   $t0, 100000
            li   $t1, -7
            move $s0, $t0
            neg  $s1, $t1
            not  $s2, $zero
            abs  $s3, $t1
            mul  $s4, $t1, 6
            div  $s5, $t0, 7
            rem  $s6, $t0, 7
            seq  $s7, $t1, -7
            sgt  $t2, $t0, $t1
            sle  $t3, $t0, $t1
            sne  $t4, $t0, $t0
            rol  $t5, $t1, 4
            ror  $t6, $t1, 4
            subi $t7, $t0, 1
            addi $t8, $zero, 70000
            jr   $ra
    `);
    assert.equal(res.state, 'exited');
    assert.equal(reg(spim, 's0'), 100000);
    assert.equal(reg(spim, 's1'), 7);
    assert.equal(reg(spim, 's2'), -1);
    assert.equal(reg(spim, 's3'), 7);
    assert.equal(reg(spim, 's4'), -42);
    assert.equal(reg(spim, 's5'), 14285);
    assert.equal(reg(spim, 's6'), 5);
    assert.equal(reg(spim, 's7'), 1);
    assert.equal(reg(spim, 't2'), 1);
    assert.equal(reg(spim, 't3'), 0);
    assert.equal(reg(spim, 't4'), 0);
    assert.equal(reg(spim, 't5') >>> 0, 0xffffff9f);
    assert.equal(reg(spim, 't6') >>> 0, 0x9fffffff);
    assert.equal(reg(spim, 't7'), 99999);
    assert.equal(reg(spim, 't8'), 70000);
});

test('conditional branch pseudo instructions (signed and unsigned)', () => {
    const { spim } = run(`
        main:
            li $t0, -1
            li $t1, 1
            li $s0, 0
            blt  $t0, $t1, a        # signed: -1 < 1
            ori  $s0, $s0, 1
        a:  bltu $t0, $t1, b        # unsigned: 0xffffffff < 1 is false
            ori  $s0, $s0, 2
        b:  bge  $t1, 1, c          # immediate operand
            ori  $s0, $s0, 4
        c:  bgt  $t1, $t0, d
            ori  $s0, $s0, 8
        d:  ble  $t1, $t0, e
            ori  $s0, $s0, 16
        e:  beqz $zero, f
            ori  $s0, $s0, 32
        f:  jr $ra
    `);
    assert.equal(reg(spim, 's0'), 2 | 16);
});

// ============================================================
//  Data segment
// ============================================================
test('data directives are aligned and little endian', () => {
    const { spim, program } = run(`
            .data
        b:  .byte 1, 2, 'A'
        w:  .word 0x11223344, b
        h:  .half -2
        s:  .asciiz "hi\\n"
        d:  .double 1.5
        r:  .word 7:3
        sp: .space 5
        e:  .byte 9
            .text
        main: jr $ra
    `);
    const sym = program.symbols;
    assert.equal(sym.b, 0x10010000);
    assert.equal(sym.w, 0x10010004);      // aligned to 4
    assert.equal(sym.h, 0x1001000c);
    assert.equal(sym.s, 0x1001000e);
    assert.equal(sym.d, 0x10010018);      // aligned to 8
    assert.equal(sym.r, 0x10010020);
    assert.equal(sym.sp, 0x1001002c);
    assert.equal(sym.e, 0x10010031);
    assert.equal(spim.readByte(0x10010002), 65);
    assert.equal(spim.readWord(0x10010004), 0x11223344);
    assert.equal(spim.readByte(0x10010004), 0x44);
    assert.equal(spim.readWord(0x10010008), 0x10010000);
    assert.equal(spim.cpu.mem.read16(0x1001000c), 0xfffe);
    assert.equal(spim.cpu.mem.readString(sym.s), 'hi\n');
    assert.equal(spim.readWord(0x10010028), 7);
});

test('.eqv constants and label arithmetic', () => {
    const { spim } = run(`
            .eqv SIZE 4
            .data
        arr: .word 10, 20, 30, 40
            .text
        main:
            lw   $t0, arr+8
            la   $t1, arr
            lw   $t2, SIZE*3($t1)
            li   $t3, SIZE
            lw   $t4, arr($t3)
            jr   $ra
    `);
    assert.equal(reg(spim, 't0'), 30);
    assert.equal(reg(spim, 't2'), 40);
    assert.equal(reg(spim, 't3'), 4);
    assert.equal(reg(spim, 't4'), 20);
});

// ============================================================
//  CPU semantics
// ============================================================
test('arithmetic, hi/lo and memory accesses', () => {
    const { spim } = run(`
            .data
        v:  .byte -1
            .align 2
        x:  .word 0
            .text
        main:
            li    $t0, 0x7fffffff
            addu  $t1, $t0, 1           # wraps, no trap
            li    $a0, 100000
            li    $a1, 300000
            mult  $a0, $a1
            mfhi  $s0
            mflo  $s1
            li    $a0, -7
            li    $a1, 2
            div   $a0, $a1
            mflo  $s2
            mfhi  $s3
            lb    $s4, v
            lbu   $s5, v
            sw    $s1, x
            lw    $s6, x
            sltu  $s7, $a0, $a1
            jr    $ra
    `);
    assert.equal(reg(spim, 't1'), -2147483648);
    assert.equal(reg(spim, 's0'), 6);
    assert.equal(reg(spim, 's1') >>> 0, 0xfc23ac00);
    assert.equal(reg(spim, 's2'), -3);
    assert.equal(reg(spim, 's3'), -1);
    assert.equal(reg(spim, 's4'), -1);
    assert.equal(reg(spim, 's5'), 255);
    assert.equal(reg(spim, 's6') >>> 0, 0xfc23ac00);
    assert.equal(reg(spim, 's7'), 0);
});

test('$zero is never written', () => {
    const { spim } = run('main: li $zero, 5\n addi $zero, $zero, 1\n jr $ra');
    assert.equal(reg(spim, 'zero'), 0);
});

test('add overflow raises an exception', () => {
    const { res, cpu } = run('main: li $t0, 0x7fffffff\n addi $t0, $t0, 1\n jr $ra');
    assert.equal(res.state, 'error');
    assert.match(cpu.error, /Arithmetic overflow/);
    assert.equal(cpu.cp0.cause, 12 << 2);
    assert.equal(cpu.cp0.epc, cpu.pc);
});

test('bad and unaligned addresses raise exceptions', () => {
    let r = run('main: lw $t0, 0($zero)\n jr $ra');
    assert.match(r.cpu.error, /bad address 0x00000000/);
    r = run('main: li $t0, 0x10010001\n lw $t1, 0($t0)\n jr $ra');
    assert.match(r.cpu.error, /unaligned address 0x10010001/);
    assert.equal(r.cpu.cp0.badvaddr, 0x10010001);
});

test('user exception handler in .ktext', () => {
    const { res, spim } = run(`
            .ktext 0x80000180
            mfc0 $k0, $13           # cause
            mfc0 $k1, $14           # epc
            addiu $k1, $k1, 4
            mtc0 $k1, $14
            li   $s1, 99
            eret
            .text
        main:
            li $t0, 0x7fffffff
            addi $t0, $t0, 1        # overflow -> handler -> continue
            li $s2, 1
            li $v0, 10
            syscall
    `);
    assert.equal(res.state, 'exited');
    assert.equal(reg(spim, 's1'), 99);
    assert.equal(reg(spim, 's2'), 1);
    assert.equal(reg(spim, 'k0'), 12 << 2);
});

test('floating point operations', () => {
    const { spim, out } = run(`
            .data
        a:  .float 1.5
        b:  .float 2.25
        c:  .double 10.0
            .text
        main:
            l.s   $f0, a
            l.s   $f1, b
            add.s $f2, $f0, $f1
            c.lt.s $f0, $f1
            bc1f  skip
            li    $s0, 1
        skip:
            l.d   $f4, c
            li    $t0, 4
            mtc1  $t0, $f6
            cvt.d.w $f6, $f6
            div.d $f8, $f4, $f6
            cvt.w.d $f10, $f8
            mfc1  $s1, $f10
            mov.s $f12, $f2
            li    $v0, 2
            syscall
            li.s  $f12, -0.5
            li    $v0, 2
            syscall
            jr    $ra
    `);
    assert.equal(spim.cpu.ff[2], 3.75);
    assert.equal(reg(spim, 's0'), 1);
    assert.equal(spim.cpu.fd[4], 2.5);
    assert.equal(reg(spim, 's1'), 2);
    assert.equal(out, '3.75000000-0.50000000');
});

// ============================================================
//  Syscalls / IO
// ============================================================
test('syscalls: print, read and exit', () => {
    const { out, res, spim } = run(`
            .data
        buf: .space 16
            .text
        main:
            li $v0, 5
            syscall
            move $a0, $v0
            li $v0, 1
            syscall
            li $a0, '-'
            li $v0, 11
            syscall
            la $a0, buf
            li $a1, 16
            li $v0, 8
            syscall
            li $v0, 4
            syscall
            li $a0, 255
            li $v0, 34
            syscall
            li $a0, -1
            li $v0, 36
            syscall
            li $a0, 3
            li $v0, 17
            syscall
    `, ['  42', 'hello']);
    assert.equal(res.state, 'exited');
    assert.equal(spim.cpu.exitCode, 3);
    assert.equal(out, '42-hello\n0x000000ff4294967295');
});

test('read syscall waits for input when none is available', () => {
    let out = '';
    const spim = new SPIM({ write: t => out += t });
    spim.load('main: li $v0, 5\n syscall\n move $a0, $v0\n li $v0, 1\n syscall\n jr $ra');
    let res = spim.run();
    assert.equal(res.state, 'input');
    spim.provideInput('123');
    res = spim.run();
    assert.equal(res.state, 'exited');
    assert.equal(out, '123');
});

test('sbrk returns heap memory after the data segment', () => {
    const { spim } = run(`
            .data
        x:  .word 1
            .text
        main:
            li $a0, 12
            li $v0, 9
            syscall
            move $s0, $v0
            li $a0, 4
            li $v0, 9
            syscall
            move $s1, $v0
            li $t0, 77
            sw $t0, 0($s0)
            lw $s2, 0($s0)
            jr $ra
    `);
    assert.equal(reg(spim, 's0'), 0x10010008);
    assert.equal(reg(spim, 's1'), 0x10010018);
    assert.equal(reg(spim, 's2'), 77);
});

// ============================================================
//  Runner behaviour
// ============================================================
test('breakpoints stop the execution', () => {
    const spim = new SPIM({});
    const p = spim.load('main: li $t0, 1\nbp: li $t0, 2\n li $t0, 3\n jr $ra');
    spim.toggleBreakpoint(p.symbols.bp, true);
    let res = spim.run();
    assert.equal(res.breakpoint, p.symbols.bp);
    assert.equal(reg(spim, 't0'), 1);
    res = spim.run();
    assert.equal(res.state, 'exited');
    assert.equal(reg(spim, 't0'), 3);
});

test('falling off the end of the program is reported', () => {
    const { res, cpu } = run('li $t0, 1', [], { startup: false });
    assert.equal(res.state, 'error');
    assert.match(cpu.error, /non-instruction/);
});

test('without main the program starts at the first instruction', () => {
    const { program, spim } = run('start: li $t0, 9\n li $v0, 10\n syscall');
    assert.equal(program.startup, false);
    assert.equal(program.entry, 0x00400000);
    assert.equal(reg(spim, 't0'), 9);
});

test('reset restores the initial state', () => {
    const { spim } = run('main: li $t0, 9\n jr $ra');
    spim.reset();
    assert.equal(reg(spim, 't0'), 0);
    assert.equal(reg(spim, 'sp') >>> 0, 0x7fffeffc);
    assert.equal(spim.pc, 0x00400000);
    assert.equal(spim.state, 'ready');
});

// ============================================================
//  Errors
// ============================================================
test('reports assembler errors with line numbers', () => {
    const p = new SPIM.Assembler().assemble([
        'main:',
        '  addd $t0, $t1, $t2',
        '  lw $t0, missing',
        '  addi $t0, $t9x, 1',
        '  beq $t0, $t1',
        '  sll $t0, $t0, 40',
        'main: nop',
        '  .wordz 1',
    ].join('\n'));
    assert.equal(p.ok, false);
    const byLine = Object.fromEntries(p.errors.map(e => [e.line, e.message]));
    assert.match(byLine[2], /unknown instruction "addd"/);
    assert.match(byLine[3], /undefined symbol "missing"/);
    assert.match(byLine[4], /invalid register/);
    assert.match(byLine[5], /"beq" expects rs, rt\|imm, label/);
    assert.match(byLine[6], /shift amount 40/);
    assert.match(byLine[7], /defined twice/);
    assert.match(byLine[8], /unknown directive/);
});

// ============================================================
//  Examples
// ============================================================
test('bundled examples run', () => {
    const dir = path.join(__dirname, '..', 'src', 'examples');
    const expected = {
        'hello.asm': [[], 'Hello, World!\n'],
        'factorial.asm': [['10'], 'Enter a number: 10! = 3628800\n'],
        'bubble_sort.asm': [[], '34 7 23 32 5 62 -4 18 0 11 \n-4 0 5 7 11 18 23 32 34 62 \n'],
        'floats.asm': [[], 'area   = 19.63495445\nsqrt 2 = 1.4142135623730951\n'],
        'strings.asm': [['ada'], 'Your name: HELLO, ADA\n'],
    };
    Object.entries(expected).forEach(([file, [input, output]]) => {
        const { out, res } = run(fs.readFileSync(path.join(dir, file), 'utf8'), input);
        assert.equal(res.state, 'exited', file);
        assert.equal(out, output, file);
    });
    const fib = run(fs.readFileSync(path.join(dir, 'fibonacci.asm'), 'utf8'));
    assert.match(fib.out, /fib\(15\) = 610\n$/);
});
