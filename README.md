<br>
<br>
<h1 align="center">SpimHub</h1>
<br>
<br>
<br>
<p align="center">
    <img src="./docs/img/label-black.png" alt="SpimHub Label" />
</p>
<br>
<p align="center">
    <a href="./CONTRIBUTING.md">Contributing</a>
    ·
    <a href="https://github.com/ZhengLinLei/spimhub/issues">Issues</a>
</p>

<hr>

```
  SpimHub - A MIPS Assembly IDE for Web Browsers

            _            _        _         _   _         _       _    _                  _        
           / /\         /\ \     /\ \      /\_\/\_\ _    / /\    / /\ /\_\               / /\      
          / /  \       /  \ \    \ \ \    / / / / //\_\ / / /   / / // / /         _    / /  \     
         / / /\ \__   / /\ \ \   /\ \_\  /\ \/ \ \/ / // /_/   / / / \ \ \__      /\_\ / / /\ \    
        / / /\ \___\ / / /\ \_\ / /\/_/ /  \____\__/ // /\ \__/ / /   \ \___\    / / // / /\ \ \   
        \ \ \ \/___// / /_/ / // / /   / /\/________// /\ \___\/ /     \__  /   / / // / /\ \_\ \  
         \ \ \     / / /__\/ // / /   / / /\/_// / // / /\/___/ /      / / /   / / // / /\ \ \___\ 
     _    \ \ \   / / /_____// / /   / / /    / / // / /   / / /      / / /   / / // / /  \ \ \__/ 
    /_/\__/ / /  / / /   ___/ / /__ / / /    / / // / /   / / /      / / /___/ / // / /____\_\ \   
    \ \/___/ /  / / /   /\__\/_/___\\/_/    / / // / /   / / /      / / /____\/ // / /__________\  
     \_____\/   \/_/    \/_________/        \/_/ \/_/    \/_/       \/_________/ \/_____________/  
                                                                                               


    © 2023 ZhengLinLei <zheng9112003@icloud.com>
```

SpimHub is a **MIPS and RISC-V** assembly IDE for teaching that runs in the browser: file explorer,
multi window editor with syntax highlighting, **MIPS32** and **RISC-V RV32IM assemblers**, a
**simulator** (text segment, data segment, registers, breakpoints, program i/o) and a visual
**5 stage pipeline** (IF, ID, EX, MEM, WB) that shows where every instruction is in each cycle, the
memory it uses and the hazards of instruction level parallelism: stalls, forwarding and flushes.
Everything runs client side and the project is saved in `localStorage`.

The same engine is available as a **command line assembler / simulator** (`spimhub program.asm`).

## Quick start

### Docker (web IDE)

```bash
docker build -t spimhub .
```

```bash
docker run -d -p 8080:80 --name spimhub spimhub
```

Open http://localhost:8080. Or with compose: `docker compose up -d`.

### Docker (command line)

```bash
docker build --target cli -t spimhub-cli .
```

```bash
docker run -i --rm -v "$PWD":/work spimhub-cli program.asm
```

### Node (no Docker)

```bash
npm install
npm run build                   # src/ -> docs/ (+ dist/ for the CLI)
npm start                       # build + http://localhost:8080
node bin/spimhub.js program.asm # command line
npm test                        # build + tests
npm run typecheck               # tsc
```

## The IDE

| Area | What it does |
| --- | --- |
| `[project]` | Virtual filesystem (files / folders, rename, delete). **Drag & drop**: move files and folders, drop `.asm` files / folders from the computer to import them, drop a `.spim` project to open it |
| `[editor]` | Up to 4 windows, scrollable tabs (wheel, middle click closes, drag to reorder or to another window), MIPS / RISC-V highlighting, `[run]` + `[status]`, error lines underlined, **find / replace** in the file (case, whole word, regex), auto indent, `Tab` / `Shift + Tab` on the selected lines, `Ctrl + /` comments |
| `[search]` | Search / replace in every file while typing: case, whole word, regex, files filter (`*.asm, /examples/riscv/, !hello.asm`), results by file with line numbers, `↑ ↓` + `Enter` |
| `[runner]` | `[arch: auto/mips/risc-v]` `[assemble] [reset] [pause] [run step] [pipeline] [run all]`, text segment (`[bkpt]` breakpoints, current `pc`), data segment (`[.data] [heap] [stack] [ascii]`), registers (MIPS: + coproc1 / coproc0) (`[hex]`/`[dec]`, changed values highlighted) |
| `[pipeline]` | Datapath of the 5 stage pipeline cycle by cycle, memory map, diagram instructions × cycles, hazards, CPI / IPC. `[forwarding: on/off]`, `[branch: EX/ID]` |
| `[output]` | Program output; the input line appears when the program reads (syscalls 5, 6, 7, 8, 12) |
| `[console]` | Assembler errors / warnings and execution log (`[download logs]` in the runner menu) |
| `[terminal]` | Commands: `help ls cd tree cat open touch mkdir run asm step continue pause reset reg mem bkpt symbols pipeline theme ...` (+ the commands of the extensions) |
| `[extensions]` | Marketplace of the extension servers, install / update / disable / uninstall, page of each extension with its README and panels |
| `[settings]` | Theme, font size, tab size, autosave, default architecture, pipeline options, **extension servers**, project data |
| status bar | Architecture, file, saved state, runner state, line / column, items of the extensions, `[>_]` command palette |

### Shortcuts

| Keys | Action |
| --- | --- |
| `Alt + Shift + R` | Assemble and run the active file |
| `Alt + Shift + A` | Assemble the active file |
| `F5` / `F10` | Run all / run step |
| `Alt + R` / `Alt + E` / `Alt + L` | Runner / editor / pipeline |
| `Alt + N` / `Alt + M` | New file / new folder |
| `Alt + S` / `Alt + A` | Save / save all (also `Ctrl/⌘ + S`) |
| `Alt + T` / `Alt + J` / `Alt + I` | Terminal / console / output |
| `Alt + W` | New editor window |
| `Ctrl/⌘ + F` / `Alt + F` | Find / replace in the file (`Enter`, `Shift + Enter`, `F3`) |
| `Ctrl/⌘ + Shift + F` | Search in all files |
| `Ctrl/⌘ + Shift + P` / `F1` | Command palette (commands and files) |
| `Ctrl/⌘ + G` | Go to line |
| `Ctrl/⌘ + /` | Toggle comment |
| `Ctrl/⌘ + ,` / `Alt + Shift + X` | Settings / extensions |
| `Alt + K` | Light / dark theme |
| `Alt + X` / `Alt + Z` / `Alt + Y` | Save / open / new project |

## Extensions

Extensions are JavaScript / CSS packages installed from **extension servers** (repositories): any HTTP
folder with an `index.json` and one folder per extension (`manifest.json`, `main.js`, `style.css`,
`README.md`). Add servers in `[settings]`. Installed extensions are saved in `localStorage` and run on
every start; they receive a `spimhub` API (events of the simulator, terminal commands, command palette,
status bar, panels, storage, editor and engine access).

The folder [`extensions/`](./extensions) of this repository is an example server (served at
`/extensions/` by `npm start` and Docker, and from GitHub raw). It has: 🐾 pet, 🎉 confetti, 🔢 number
converter (installed by default), 📊 instruction mix, ✂️ snippets, 🔊 retro sounds and 🧛 Dracula theme.
Read [`extensions/README.md`](./extensions/README.md) to write your own.

## MIPS or RISC-V

The architecture is detected from the source (`$t0` + `syscall` → MIPS, `t0` / `x5` + `ecall` → RISC-V).
Force it with a comment `# arch: riscv` / `# arch: mips`, with `[arch: ...]` in the runner or with
`--arch` in the command line. Files are `.asm` for both. Examples: `/examples/mips`, `/examples/riscv`
and `/examples/pipeline` (hazards demos and an ILP exercise).

## Assembler

* Two passes, SPIM / RARS syntax, `#` comments, labels, expressions (`label+4`, `SIZE*3`, `'a'`, `0x..`, `0b..`).
* If the program defines `main`, the SPIM start up code is added at `0x00400000` (`jal main`, then exit),
  so `jr $ra` from `main` ends the program. Without `main` the execution starts at the first instruction.
  For RISC-V the start up code is `jal ra, main` + exit, so `ret` from `main` ends the program.
* Memory map (both architectures, like SPIM / MARS / RARS): `.text 0x00400000`, `.data 0x10010000`,
  `gp 0x10008000`, `sp 0x7fffeffc`, `.ktext 0x80000180` (MIPS exception handler), `.kdata 0x90000000`.
  Little endian.

**Directives**: `.text .data .ktext .kdata .word .half .byte .float .double .ascii .asciiz .asciz .space .zero .align .p2align .globl .extern .eqv/.equ/.set .section` (`.word 0:10` repeats a value). Expressions accept `%hi(x)` / `%lo(x)`.

### MIPS32

**Instructions** (real, encoded and executed as machine code):
`add addu addi addiu sub subu and andi or ori xor xori nor slt sltu slti sltiu lui sll srl sra sllv srlv srav
mult multu div divu mfhi mflo mthi mtlo mul madd maddu msub msubu clz clo movz movn
lb lbu lh lhu lw lwl lwr ll sb sh sw swl swr sc beq bne blez bgtz bltz bgez bltzal bgezal j jal jr jalr
syscall break teq tne eret mfc0 mtc0`
and the FPU: `add sub mul div abs neg mov sqrt .s/.d, cvt.s.d cvt.s.w cvt.d.s cvt.d.w cvt.w.s cvt.w.d,
round/trunc/ceil/floor.w, c.eq c.lt c.le, bc1t bc1f, mfc1 mtc1, lwc1 swc1 ldc1 sdc1`.

**Pseudo instructions**: `li la move nop neg negu not abs mul(imm) div/divu/rem/remu (3 operands) mulo
seq sne sgt sgtu sge sgeu sle sleu rol ror subi b bal beqz bnez blt bltu bgt bgtu ble bleu bge bgeu
l.s s.s l.d s.d li.s li.d`, immediates that do not fit in 16 bits, `lw $t0, label`, `lw $t0, label($t1)`,
R-type with an immediate (`add $t0, $t1, 5`) and two operand forms (`add $t0, $t1`).

### RISC-V RV32IM

**Registers**: `x0`-`x31` and ABI names (`zero ra sp gp tp t0-t6 s0/fp s1-s11 a0-a7`), no `$`.

**Instructions**: `add sub sll slt sltu xor srl sra or and addi slti sltiu xori ori andi slli srli srai
lb lh lw lbu lhu sb sh sw beq bne blt bge bltu bgeu jal jalr lui auipc ecall ebreak fence` and RV32M
`mul mulh mulhsu mulhu div divu rem remu`.

**Pseudo instructions**: `nop li la mv not neg seqz snez sltz sgtz beqz bnez blez bgez bltz bgtz bgt ble
bgtu bleu j jal(label) jr jalr(rs) ret call tail subi`, `lw rd, label` and `sw rs, label, temp`.

No overflow traps; division by zero returns -1 (remainder = dividend), as the specification says.

## Simulator

* Executes the encoded words (the text segment shows exactly what runs).
* Exceptions: arithmetic overflow, address errors (bad / unaligned address, writing the text segment),
  `break`, traps, reserved instructions. Without a handler the execution stops and `cause`, `epc` and
  `vaddr` show what happened; with a `.ktext 0x80000180` handler it jumps there (`eret` returns).
* Syscalls (SPIM / MARS / RARS numbers). MIPS: number in `$v0`, arguments `$a0-$a2`, result in `$v0`.
  RISC-V: number in `a7`, arguments `a0-a2`, result in `a0`; exit is `10` or `93`. The float syscalls
  (2, 3, 6, 7, 43, 44) are MIPS only.

| `$v0` / `a7` | | `$v0` / `a7` | |
| --- | --- | --- | --- |
| 1 | print_int `$a0` | 11 | print_char `$a0` |
| 2 | print_float `$f12` | 12 | read_char → `$v0` |
| 3 | print_double `$f12` | 13-16 | open / read / write / close (stdin, stdout) |
| 4 | print_string `$a0` | 17 | exit2 `$a0` |
| 5 | read_int → `$v0` | 30 | time → `$a0 $a1` |
| 6 | read_float → `$f0` | 34 / 35 / 36 | print hex / binary / unsigned |
| 7 | read_double → `$f0` | 40 / 41 / 42 | random seed / int / int range |
| 8 | read_string `$a0`, `$a1` | 43 / 44 | random float / double |
| 9 | sbrk `$a0` → `$v0` | | |
| 10 | exit | | |

## Pipeline (instruction level parallelism)

Didactic model of the classic in-order 5 stage pipeline (Patterson & Hennessy), the same for MIPS
and RISC-V:

* **Data hazards (RAW)**: with forwarding (`EX/MEM → EX`, `MEM/WB → EX`, `MEM/WB → MEM` for store
  data) or stalls when forwarding is off (register file written in the first half of WB and read in
  the second half of ID).
* **Load-use**: 1 stall even with forwarding.
* **Control hazards**: predict not taken; a taken branch resolved in EX flushes 2 instructions, in ID
  flushes 1 (and needs its operands one cycle earlier). Jumps are resolved in ID.
* **View**: datapath with the instruction of every stage (`run`, `stall`, `bubble`, `flush`), active
  units, forwarding paths and the redirect of taken branches; memory map with `IF` (pc), the address
  accessed in `MEM` and `sp`; diagram instructions × cycles (click a row to see its hazards and its
  producers); CPI, IPC, stalls, flushes and forwards.
* Step **cycle by cycle** (`[cycle >]`, `[play]`): the simulator executes only the instructions that
  the cycle needs. Changing `[forwarding]` / `[branch]` recomputes the whole schedule.

Simplifications: 1 cycle EX for every instruction (mul / div / FPU included), perfect memory, no
branch delay slots. The trace keeps the first 20000 executed instructions.

## Command line

```
spimhub [options] <file.asm>
      --arch A         mips | riscv | auto (default: detected from the source)
  -a, --assemble       assemble only
  -p, --pipeline       print the pipeline diagram, hazards and CPI
      --no-forwarding  pipeline without forwarding
      --branch-id      branches resolved in ID (default EX)
  -d, --dump           print the text segment (address, code, basic, source)
  -D, --data           print the data segment
  -s, --symbols        print the symbol table
  -r, --registers      print the registers when the program stops
  -m, --max-steps N    stop after N instructions (default 10000000)
      --no-startup     do not add the start up code
```

Exit code: the program exit code, `1` assemble errors, `3` runtime exception, `4` step limit.

## Contributing

To contribute, please read the [CONTRIBUTING.md](./CONTRIBUTING.md) file.
