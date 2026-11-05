# =====================================
#   SpimHub - Hello World (RISC-V RV32I)
#   Syscalls like RARS: number in a7, arguments in a0, a1...
# =====================================

        .data
msg:    .asciz "Hello, RISC-V!\n"

        .text
        .globl main
main:
        li   a7, 4              # print_string
        la   a0, msg
        ecall

        li   a7, 10             # exit
        ecall
