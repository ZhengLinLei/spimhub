# =====================================
#   SpimHub - Recursive Fibonacci (RISC-V)
#   fib(n) = fib(n-1) + fib(n-2)
#   Compare it with /examples/mips/fibonacci.asm
# =====================================

        .data
prompt: .asciz "fib("
close:  .asciz ") = "
nl:     .asciz "\n"

        .text
        .globl main
main:
        addi sp, sp, -8         # main calls fib: save ra and s0
        sw   ra, 4(sp)
        sw   s0, 0(sp)

        li   s0, 0              # i = 0
loop:
        li   t0, 15
        bgt  s0, t0, end        # for (i = 0; i <= 15; i++)

        li   a7, 4
        la   a0, prompt
        ecall
        li   a7, 1
        mv   a0, s0
        ecall
        li   a7, 4
        la   a0, close
        ecall

        mv   a0, s0
        call fib                # a0 = fib(i)

        li   a7, 1
        ecall
        li   a7, 4
        la   a0, nl
        ecall

        addi s0, s0, 1
        j    loop
end:
        lw   s0, 0(sp)
        lw   ra, 4(sp)
        addi sp, sp, 8
        ret                     # back to the start up code -> exit

# int fib(int n)
fib:
        li   t0, 2
        blt  a0, t0, fib_base   # if (n < 2) return n
        addi sp, sp, -12        # push ra, s0, s1
        sw   ra, 8(sp)
        sw   s0, 4(sp)
        sw   s1, 0(sp)

        mv   s0, a0
        addi a0, s0, -1
        call fib                # fib(n - 1)
        mv   s1, a0
        addi a0, s0, -2
        call fib                # fib(n - 2)
        add  a0, a0, s1

        lw   s1, 0(sp)          # pop
        lw   s0, 4(sp)
        lw   ra, 8(sp)
        addi sp, sp, 12
fib_base:
        ret
