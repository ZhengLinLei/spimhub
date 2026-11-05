# =====================================
#   SpimHub - Factorial (reads a number)
#   Type the number in the [output] tab
# =====================================

        .data
ask:    .asciiz "Enter a number: "
res1:   .asciiz "! = "
nl:     .asciiz "\n"

        .text
        .globl main
main:
        li   $v0, 4
        la   $a0, ask
        syscall

        li   $v0, 5             # read_int
        syscall
        move $s0, $v0

        move $a0, $s0
        jal  fact
        move $s1, $v0

        li   $v0, 1             # print n
        move $a0, $s0
        syscall
        li   $v0, 4
        la   $a0, res1
        syscall
        li   $v0, 1             # print n!
        move $a0, $s1
        syscall
        li   $v0, 4
        la   $a0, nl
        syscall

        li   $v0, 10
        syscall

# int fact(int n)  (iterative)
fact:
        li   $v0, 1
fact_loop:
        blez $a0, fact_end
        mul  $v0, $v0, $a0
        addi $a0, $a0, -1
        b    fact_loop
fact_end:
        jr   $ra
