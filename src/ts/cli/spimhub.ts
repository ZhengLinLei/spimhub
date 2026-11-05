/* =========================================================================
    SpimHub - A MIPS Assembly IDE for Web Browsers

    Path: src/ts/cli/spimhub.ts  (built into dist/cli.cjs, run with bin/spimhub.js)

    Command line assembler + simulator. Same engine as the web IDE.

        spimhub program.asm             assemble and run
        spimhub -d program.asm          print the text segment (machine code)
        spimhub -a program.asm          assemble only (exit code 1 on errors)

    © 2026 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import * as fs from 'fs';
import * as path from 'path';
import SPIM from '../engine/spim';

const { hex } = SPIM;

const HELP = `SpimHub ${SPIM.VERSION} - MIPS32 / RISC-V (RV32IM) assembler & simulator

Usage: spimhub [options] <file.asm>

Options:
      --arch A         mips | riscv | auto (default: detected from the source)
  -a, --assemble       assemble only, do not run
  -p, --pipeline       print the 5 stage pipeline diagram, hazards and CPI
      --no-forwarding  pipeline without forwarding
      --branch-id      branches resolved in ID (default EX)
  -d, --dump           print the text segment (address, code, basic, source)
  -D, --data           print the data segment
  -s, --symbols        print the symbol table
  -r, --registers      print the registers when the program stops
  -m, --max-steps N    stop after N instructions (default 10000000)
      --no-startup     do not add the SPIM start up code (start at main / first instruction)
  -q, --quiet          do not print the exit message
  -v, --version        print the version
  -h, --help           show this help
`;

// ---------------- Arguments ----------------
const args = process.argv.slice(2);
interface Options {
    maxSteps: number; run: boolean; dump?: boolean; data?: boolean; symbols?: boolean;
    registers?: boolean; startup?: boolean; quiet?: boolean;
    arch: 'mips' | 'riscv' | 'auto'; pipeline?: boolean; forwarding: boolean; branchStage: 'ID' | 'EX';
}
const opt: Options = { maxSteps: 10000000, run: true, arch: 'auto', forwarding: true, branchStage: 'EX' };
let file: string | null = null;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
        case '-a': case '--assemble': opt.run = false; break;
        case '--arch': {
            const v = (args[++i] || '').toLowerCase().replace('-', '');
            if (v !== 'mips' && v !== 'riscv' && v !== 'auto') { console.error(`spimhub: unknown architecture ${v}`); process.exit(2); }
            opt.arch = v;
            break;
        }
        case '-p': case '--pipeline': opt.pipeline = true; break;
        case '--no-forwarding': opt.forwarding = false; break;
        case '--branch-id': opt.branchStage = 'ID'; break;
        case '-d': case '--dump': opt.dump = true; break;
        case '-D': case '--data': opt.data = true; break;
        case '-s': case '--symbols': opt.symbols = true; break;
        case '-r': case '--registers': opt.registers = true; break;
        case '-m': case '--max-steps': opt.maxSteps = Number(args[++i]); break;
        case '--no-startup': opt.startup = false; break;
        case '-q': case '--quiet': opt.quiet = true; break;
        case '-v': case '--version': console.log(SPIM.VERSION); process.exit(0); break;
        case '-h': case '--help': process.stdout.write(HELP); process.exit(0); break;
        case '-file': break;    // spim compatibility: spim -file program.asm
        default:
            if (a.startsWith('-')) { console.error(`spimhub: unknown option ${a}\n`); process.stderr.write(HELP); process.exit(2); }
            file = a;
    }
}

if (!file) { process.stderr.write(HELP); process.exit(2); }

let source: string;
try {
    source = fs.readFileSync(file, 'utf8');
} catch (e) {
    console.error(`spimhub: cannot read ${file}: ${(e as Error).message}`);
    process.exit(2);
}

// ---------------- Stdin (synchronous line reader) ----------------
let stdinBuf = '';
let stdinEOF = false;
const readLine = (): string => {
    while (!stdinBuf.includes('\n') && !stdinEOF) {
        const chunk = Buffer.alloc(4096);
        let n = 0;
        try { n = fs.readSync(0, chunk, 0, chunk.length, null); }
        catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code === 'EAGAIN') continue;
            if (code === 'EOF') n = 0; else throw e;
        }
        if (n === 0) stdinEOF = true;
        else stdinBuf += chunk.subarray(0, n).toString('utf8');
    }
    if (!stdinBuf.length && stdinEOF) return '';
    const i = stdinBuf.indexOf('\n');
    const line = i === -1 ? stdinBuf : stdinBuf.slice(0, i);
    stdinBuf = i === -1 ? '' : stdinBuf.slice(i + 1);
    return line.replace(/\r$/, '');
};

// ---------------- Assemble ----------------
const spim = new SPIM({ write: (t) => process.stdout.write(t), readLine });
const program = spim.load(source, path.basename(file), { startup: opt.startup, arch: opt.arch });
spim.setPipelineOptions({ forwarding: opt.forwarding, branchStage: opt.branchStage });
if (!opt.quiet && process.stderr.isTTY) console.error(`[${spim.archLabel}]`);

program.warnings.forEach(w => console.error(`${file}:${w.line}: warning: ${w.message}`));
if (!program.ok) {
    program.errors.forEach(e => console.error(`${file}:${e.line}: error: ${e.message}`));
    process.exit(1);
}

if (opt.dump) {
    console.log('[address]   [code]      [basic]                       [source]');
    program.text.forEach(t => {
        const src = !t.source ? '' : t.boot ? `[startup] ${t.source}` : `${String(t.line).padStart(4)}: ${t.source}`;
        console.log(`${hex(t.addr)}  ${hex(t.word)}  ${t.basic.padEnd(30)}${src}`);
    });
}
if (opt.data) {
    console.log('[address]   [value +0]  [value +4]  [value +8]  [value +c]');
    for (let a = program.dataStart; a < program.dataEnd; a += 16) {
        const row = [0, 4, 8, 12].map(o => hex(spim.readWord(a + o))).join('  ');
        console.log(`${hex(a)}  ${row}`);
    }
}
if (opt.symbols) {
    Object.entries(program.symbols).sort((a, b) => a[1] - b[1])
        .forEach(([name, addr]) => console.log(`${hex(addr)}  ${name}`));
}
if (!opt.run) process.exit(0);

// ---------------- Run ----------------
const res = spim.runAll(opt.maxSteps);
const cpu = spim.cpu;

const printRegisters = () => {
    const names = spim.registers;
    const rows: string[] = [];
    const num = (i: number) => spim.arch === 'mips' ? `$${i}` : `x${i}`;
    for (let i = 0; i < 32; i++) rows.push(`${names[i].padEnd(6)}${num(i).padStart(4)} = ${hex(cpu.r[i])}`);
    rows.push(`${'pc'.padEnd(10)} = ${hex(cpu.pc)}`);
    if (cpu.arch === 'mips') rows.push(`${'hi'.padEnd(10)} = ${hex(cpu.hi)}`, `${'lo'.padEnd(10)} = ${hex(cpu.lo)}`);
    console.error('\n' + rows.join('\n'));
};

// Pipeline diagram (text): one row per instruction, one column per cycle
const printPipeline = () => {
    const rows = spim.pipeline.rows;
    const st = spim.pipeline.stats();
    const MAX = 60;
    const shown = rows.slice(0, MAX);
    const last = Math.max(...shown.map(r => r.flushed ? Math.max(r.endIF, r.endID) : r.WB), 0);
    const cell = (r: typeof rows[number], c: number): string => {
        if (r.flushed) {
            if (c >= r.IF && c <= r.endIF) return c === r.endIF && !r.ID ? 'IFx' : 'IF';
            if (r.ID && c >= r.ID && c <= r.endID) return 'IDx';
            return '';
        }
        if (c >= r.IF && c <= r.endIF) return c === r.IF ? 'IF' : '-';
        if (c >= r.ID && c <= r.endID) return c === r.ID ? 'ID' : '*';
        if (c === r.EX) return 'EX';
        if (c === r.MEM) return 'MEM';
        if (c === r.WB) return 'WB';
        return '';
    };
    const W = 28;
    let head = '#   ' + 'instruction'.padEnd(W);
    for (let c = 1; c <= last; c++) head += String(c).padStart(4);
    console.error('\n' + head);
    shown.forEach(r => {
        let line = `${String(r.id).padEnd(4)}${(r.flushed ? '(flush) ' : '') + r.basic}`.slice(0, W + 4).padEnd(W + 4);
        for (let c = 1; c <= last; c++) line += cell(r, c).padStart(4);
        console.error(line);
        r.hazards.forEach(h => console.error(`      ${h.type === 'control' ? '!' : '^'} ${h.text}`));
    });
    if (rows.length > MAX) console.error(`... ${rows.length - MAX} more rows`);
    console.error(`\n${spim.archLabel} pipeline, forwarding ${spim.pipeline.options.forwarding ? 'on' : 'off'}, branches in ${spim.pipeline.options.branchStage}` +
        `\n${st.instructions} instructions, ${st.cycles} cycles, CPI ${st.cpi.toFixed(2)}, IPC ${st.ipc.toFixed(2)}` +
        `\n${st.stalls} stall cycles (data), ${st.flushes} flushed instructions (control), ${st.forwards} forwards` +
        `\n(* stall in ID, - waiting in IF, x flushed)`);
};

if (res.state === SPIM.STATE.ERROR) {
    console.error(`\nspimhub: ${cpu.error}`);
    if (opt.registers) printRegisters();
    if (opt.pipeline) printPipeline();
    process.exit(3);
}
if (res.state === SPIM.STATE.READY) {
    console.error(`\nspimhub: stopped after ${res.steps} instructions (use --max-steps to raise the limit)`);
    if (opt.registers) printRegisters();
    process.exit(4);
}
if (opt.registers) printRegisters();
if (opt.pipeline) printPipeline();
if (!opt.quiet && process.stderr.isTTY) console.error(`\n[program exited with code ${cpu.exitCode}, ${cpu.steps} instructions]`);
process.exit(cpu.exitCode & 0xff);
