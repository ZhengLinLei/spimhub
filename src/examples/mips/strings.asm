# =====================================
#   SpimHub - Read a string and print it in UPPER CASE
# =====================================

        .data
ask:    .asciiz "Your name: "
hello:  .asciiz "HELLO, "
buffer: .space 64

        .text
        .globl main
main:
        li   $v0, 4
        la   $a0, ask
        syscall

        li   $v0, 8             # read_string(buffer, 64)
        la   $a0, buffer
        li   $a1, 64
        syscall

        la   $t0, buffer
upper:
        lbu  $t1, 0($t0)
        beqz $t1, done
        blt  $t1, 'a', skip
        bgt  $t1, 'z', skip
        addi $t1, $t1, -32      # 'a' - 'A'
        sb   $t1, 0($t0)
skip:
        addi $t0, $t0, 1
        b    upper
done:
        li   $v0, 4
        la   $a0, hello
        syscall
        li   $v0, 4
        la   $a0, buffer
        syscall

        li   $v0, 10
        syscall
