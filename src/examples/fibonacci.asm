# =====================================
#   SpimHub - Recursive Fibonacci
#   fib(n) = fib(n-1) + fib(n-2)
# =====================================

        .data
prompt: .asciiz "fib("
close:  .asciiz ") = "
nl:     .asciiz "\n"

        .text
        .globl main
main:
        li   $s0, 0             # i = 0
loop:
        bgt  $s0, 15, end       # for (i = 0; i <= 15; i++)

        li   $v0, 4
        la   $a0, prompt
        syscall
        li   $v0, 1
        move $a0, $s0
        syscall
        li   $v0, 4
        la   $a0, close
        syscall

        move $a0, $s0
        jal  fib                # $v0 = fib(i)

        move $a0, $v0
        li   $v0, 1
        syscall
        li   $v0, 4
        la   $a0, nl
        syscall

        addi $s0, $s0, 1
        j    loop
end:
        li   $v0, 10
        syscall

# int fib(int n)
fib:
        blt  $a0, 2, fib_base   # if (n < 2) return n
        addi $sp, $sp, -12      # push $ra, $s0, $s1
        sw   $ra, 8($sp)
        sw   $s0, 4($sp)
        sw   $s1, 0($sp)

        move $s0, $a0
        addi $a0, $s0, -1
        jal  fib                # fib(n - 1)
        move $s1, $v0
        addi $a0, $s0, -2
        jal  fib                # fib(n - 2)
        add  $v0, $v0, $s1

        lw   $s1, 0($sp)        # pop
        lw   $s0, 4($sp)
        lw   $ra, 8($sp)
        addi $sp, $sp, 12
        jr   $ra
fib_base:
        move $v0, $a0
        jr   $ra
