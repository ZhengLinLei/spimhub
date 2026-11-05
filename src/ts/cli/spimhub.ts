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
import SPIM from '../spim/spim';

const { hex } = SPIM.ISA;

const HELP = `SpimHub ${SPIM.VERSION} - MIPS32 assembler & simulator

Usage: spimhub [options] <file.asm>

Options:
  -a, --assemble       assemble only, do not run
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
}
const opt: Options = { maxSteps: 10000000, run: true };
let file: string | null = null;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
        case '-a': case '--assemble': opt.run = false; break;
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
const program = spim.load(source, path.basename(file), { startup: opt.startup });

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
    const names = SPIM.REGISTERS;
    const rows = [];
    for (let i = 0; i < 32; i++) rows.push(`${('$' + names[i]).padEnd(6)}${('$' + i).padStart(4)} = ${hex(cpu.r[i])}`);
    rows.push(`${'pc'.padEnd(10)} = ${hex(cpu.pc)}`, `${'hi'.padEnd(10)} = ${hex(cpu.hi)}`, `${'lo'.padEnd(10)} = ${hex(cpu.lo)}`);
    console.error('\n' + rows.join('\n'));
};

if (res.state === SPIM.STATE.ERROR) {
    console.error(`\nspimhub: ${cpu.error}`);
    if (opt.registers) printRegisters();
    process.exit(3);
}
if (res.state === SPIM.STATE.READY) {
    console.error(`\nspimhub: stopped after ${res.steps} instructions (use --max-steps to raise the limit)`);
    if (opt.registers) printRegisters();
    process.exit(4);
}
if (opt.registers) printRegisters();
if (!opt.quiet && process.stderr.isTTY) console.error(`\n[program exited with code ${cpu.exitCode}, ${cpu.steps} instructions]`);
process.exit(cpu.exitCode & 0xff);
