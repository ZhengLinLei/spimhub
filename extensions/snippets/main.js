// Snippets for MIPS and RISC-V. The architecture of the active file decides
// which version is inserted. Command palette: "snippet: ..."

const SNIPPETS = {
    'print string': {
        mips: `        li   $v0, 4             # print_string
        la   $a0, msg
        syscall
`,
        riscv: `        li   a7, 4              # print_string
        la   a0, msg
        ecall
`,
    },
    'print integer': {
        mips: `        li   $v0, 1             # print_int
        move $a0, $t0
        syscall
`,
        riscv: `        li   a7, 1              # print_int
        mv   a0, t0
        ecall
`,
    },
    'read integer': {
        mips: `        li   $v0, 5             # read_int -> $v0
        syscall
        move $t0, $v0
`,
        riscv: `        li   a7, 5              # read_int -> a0
        ecall
        mv   t0, a0
`,
    },
    'exit': {
        mips: `        li   $v0, 10            # exit
        syscall
`,
        riscv: `        li   a7, 10             # exit
        ecall
`,
    },
    'function (save ra and s0)': {
        mips: `func:
        addi $sp, $sp, -8       # prologue
        sw   $ra, 4($sp)
        sw   $s0, 0($sp)

        # body

        lw   $s0, 0($sp)        # epilogue
        lw   $ra, 4($sp)
        addi $sp, $sp, 8
        jr   $ra
`,
        riscv: `func:
        addi sp, sp, -8         # prologue
        sw   ra, 4(sp)
        sw   s0, 0(sp)

        # body

        lw   s0, 0(sp)          # epilogue
        lw   ra, 4(sp)
        addi sp, sp, 8
        ret
`,
    },
    'for loop (i = 0; i < n; i++)': {
        mips: `        li   $t0, 0            # i = 0
        li   $t1, 10           # n
for:
        bge  $t0, $t1, end_for
        # body
        addi $t0, $t0, 1
        j    for
end_for:
`,
        riscv: `        li   t0, 0             # i = 0
        li   t1, 10            # n
for:
        bge  t0, t1, end_for
        # body
        addi t0, t0, 1
        j    for
end_for:
`,
    },
    'if / else': {
        mips: `        bne  $t0, $zero, else  # if ($t0 == 0)
        # then
        j    end_if
else:
        # else
end_if:
`,
        riscv: `        bnez t0, else          # if (t0 == 0)
        # then
        j    end_if
else:
        # else
end_if:
`,
    },
    'array access a[i]': {
        mips: `        la   $t0, array        # base
        sll  $t2, $t1, 2       # i * 4
        add  $t2, $t0, $t2
        lw   $t3, 0($t2)       # a[i]
`,
        riscv: `        la   t0, array         # base
        slli t2, t1, 2         # i * 4
        add  t2, t0, t2
        lw   t3, 0(t2)         # a[i]
`,
    },
    'program skeleton': {
        mips: `        .data
msg:    .asciiz "Hello\\n"

        .text
        .globl main
main:
        li   $v0, 4
        la   $a0, msg
        syscall

        li   $v0, 10
        syscall
`,
        riscv: `        .data
msg:    .asciz "Hello\\n"

        .text
        .globl main
main:
        li   a7, 4
        la   a0, msg
        ecall

        li   a7, 10
        ecall
`,
    },
};

const insert = (name, arch) => {
    const file = spimhub.editor.active();
    const a = arch || (file ? file.arch : 'mips');
    const code = SNIPPETS[name][a];
    if (spimhub.editor.insert(code)) spimhub.notify(`snippet "${name}" (${a === 'riscv' ? 'RISC-V' : 'MIPS'})`, 'success', 1500);
};

Object.keys(SNIPPETS).forEach(name => spimhub.palette(`snippet: ${name}`, () => insert(name)));

spimhub.command('snippet', 'list snippets / insert one: snippet <number> [mips|riscv]', (args, term) => {
    const names = Object.keys(SNIPPETS);
    if (!args.length) { names.forEach((n, i) => term.print(`${String(i + 1).padStart(2)}  ${n}`)); return; }
    const name = names[Number(args[0]) - 1] || names.find(n => n.startsWith(args[0]));
    if (!name) { term.print(`snippet: unknown snippet ${args[0]}`, 'text-error'); return; }
    insert(name, args[1] === 'riscv' || args[1] === 'mips' ? args[1] : null);
}, '[number]');
