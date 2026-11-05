# =====================================
#   SpimHub - Factorial (RISC-V, reads a number)
#   Type the number in the [output] tab
# =====================================

        .data
ask:    .asciz "Enter a number: "
res1:   .asciz "! = "
nl:     .asciz "\n"

        .text
        .globl main
main:
        li   a7, 4
        la   a0, ask
        ecall

        li   a7, 5              # read_int -> a0
        ecall
        mv   s0, a0

        mv   a0, s0
        jal  fact               # jal rd = ra by default
        mv   s1, a0

        li   a7, 1              # print n
        mv   a0, s0
        ecall
        li   a7, 4
        la   a0, res1
        ecall
        li   a7, 1              # print n!
        mv   a0, s1
        ecall
        li   a7, 4
        la   a0, nl
        ecall

        li   a7, 10
        ecall

# int fact(int n)  (iterative, RV32M mul)
fact:
        li   t0, 1
fact_loop:
        blez a0, fact_end
        mul  t0, t0, a0
        addi a0, a0, -1
        j    fact_loop
fact_end:
        mv   a0, t0
        ret
