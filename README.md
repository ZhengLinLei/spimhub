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

SpimHub is a MIPS assembly IDE that runs in the browser: file explorer, multi window editor with
syntax highlighting, a **MIPS32 assembler** and a **simulator** with text segment, data segment,
registers, breakpoints and program i/o. Everything runs client side and the project is saved in
`localStorage`.

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
| `[project]` | Virtual filesystem (files / folders, rename, delete, drag & drop project backup) |
| `[editor]` | Up to 4 windows, tabs, MIPS highlighting, `[run]` + `[status]` of the last assemble, error lines underlined |
| `[runner]` | `[assemble] [reset] [pause] [run step] [run all]`, text segment (`[bkpt]` breakpoints, current `pc`), data segment (`[.data] [heap] [stack] [ascii]`), registers / coproc1 / coproc0 (`[hex]`/`[dec]`, changed values highlighted) |
| `[output]` | Program output; the input line appears when the program reads (syscalls 5, 6, 7, 8, 12) |
| `[console]` | Assembler errors / warnings and execution log (`[download logs]` in the runner menu) |
| `[terminal]` | Commands: `help ls cd tree cat open touch mkdir run asm step continue pause reset reg mem bkpt symbols theme ...` |

### Shortcuts

| Keys | Action |
| --- | --- |
| `Alt + Shift + R` | Assemble and run the active file |
| `Alt + Shift + A` | Assemble the active file |
| `F5` / `F10` | Run all / run step |
| `Alt + R` / `Alt + E` | Runner / editor |
| `Alt + N` / `Alt + M` | New file / new folder |
| `Alt + S` / `Alt + A` | Save / save all (also `Ctrl/⌘ + S`) |
| `Alt + T` / `Alt + J` / `Alt + I` | Terminal / console / output |
| `Alt + W` | New editor window |
| `Alt + F` | Find & replace |
| `Alt + K` | Light / dark theme |
| `Alt + X` / `Alt + Z` / `Alt + Y` | Save / open / new project |

## Assembler

* Two passes, SPIM syntax, `#` comments, labels, expressions (`label+4`, `SIZE*3`, `'a'`, `0x..`, `0b..`).
* If the program defines `main`, the SPIM start up code is added at `0x00400000` (`jal main`, then exit),
  so `jr $ra` from `main` ends the program. Without `main` the execution starts at the first instruction.
* Memory map: `.text 0x00400000`, `.data 0x10010000`, `$gp 0x10008000`, `$sp 0x7fffeffc`,
  `.ktext 0x80000180` (exception handler), `.kdata 0x90000000`. Little endian.

**Directives**: `.text .data .ktext .kdata .word .half .byte .float .double .ascii .asciiz .space .align .globl .extern .eqv/.equ/.set` (`.word 0:10` repeats a value).

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

## Simulator

* Executes the encoded words (the text segment shows exactly what runs).
* Exceptions: arithmetic overflow, address errors (bad / unaligned address, writing the text segment),
  `break`, traps, reserved instructions. Without a handler the execution stops and `cause`, `epc` and
  `vaddr` show what happened; with a `.ktext 0x80000180` handler it jumps there (`eret` returns).
* Syscalls:

| `$v0` | | `$v0` | |
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

## Command line

```
spimhub [options] <file.asm>
  -a, --assemble       assemble only
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
