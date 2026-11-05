# =====================================
#   SpimHub - ILP exercise: sum of an array (RISC-V)
#
#   The loop has a load-use hazard (lw -> add) and a taken branch per
#   iteration. Look at the CPI in the [pipeline] view, then:
#
#     a) move "addi t1, t1, 4" between the lw and the add
#     b) unroll the loop twice (2 elements per iteration)
#
#   and compare the cycles. Try also with [forwarding: off].
# =====================================

        .data
array:  .word 3, 1, 4, 1, 5, 9, 2, 6
n:      .word 8
msg:    .asciz "sum = "

        .text
        .globl main
main:
        la   t1, array          # p
        lw   t2, n              # count
        li   t0, 0              # sum
loop:
        lw   t3, 0(t1)
        add  t0, t0, t3         # load-use: 1 stall
        addi t1, t1, 4
        addi t2, t2, -1
        bnez t2, loop           # taken: flush

        li   a7, 4
        la   a0, msg
        ecall
        li   a7, 1
        mv   a0, t0
        ecall
        li   a7, 10
        ecall
