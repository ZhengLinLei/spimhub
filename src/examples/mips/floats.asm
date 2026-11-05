# =====================================
#   SpimHub - Floating point (coproc1)
#   Area of a circle: pi * r * r
# =====================================

        .data
pi:     .float 3.14159265
radius: .float 2.5
two:    .double 2.0
txt1:   .asciiz "area   = "
txt2:   .asciiz "\nsqrt 2 = "
nl:     .asciiz "\n"

        .text
        .globl main
main:
        l.s   $f0, pi
        l.s   $f1, radius
        mul.s $f2, $f1, $f1     # r * r
        mul.s $f12, $f2, $f0    # pi * r * r

        li    $v0, 4
        la    $a0, txt1
        syscall
        li    $v0, 2            # print_float
        syscall

        l.d    $f4, two
        sqrt.d $f12, $f4
        li    $v0, 4
        la    $a0, txt2
        syscall
        li    $v0, 3            # print_double
        syscall

        li    $v0, 4
        la    $a0, nl
        syscall

        li    $v0, 10
        syscall
