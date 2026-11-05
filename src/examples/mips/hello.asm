# =====================================
#   SpimHub - Hello World
#   Run it with [run] or Alt + Shift + R
# =====================================

        .data
msg:    .asciiz "Hello, World!\n"

        .text
        .globl main
main:
        li   $v0, 4             # print_string
        la   $a0, msg
        syscall

        li   $v0, 10            # exit
        syscall
