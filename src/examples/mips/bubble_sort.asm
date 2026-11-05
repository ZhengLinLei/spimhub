# =====================================
#   SpimHub - Bubble sort of a .word array
# =====================================

        .data
array:  .word 34, 7, 23, 32, 5, 62, -4, 18, 0, 11
size:   .word 10
space:  .asciiz " "
nl:     .asciiz "\n"

        .text
        .globl main
main:
        la   $a0, array
        lw   $a1, size
        jal  print

        la   $a0, array
        lw   $a1, size
        jal  sort

        la   $a0, array
        lw   $a1, size
        jal  print

        li   $v0, 10
        syscall

# void sort(int *a, int n)
sort:
        addi $t0, $a1, -1               # i = n - 1
outer:
        blez $t0, sort_end
        li   $t1, 0                     # j = 0
        move $t2, $a0                   # p = a
inner:
        bge  $t1, $t0, next
        lw   $t3, 0($t2)
        lw   $t4, 4($t2)
        ble  $t3, $t4, no_swap
        sw   $t4, 0($t2)                # swap a[j], a[j+1]
        sw   $t3, 4($t2)
no_swap:
        addi $t1, $t1, 1
        addi $t2, $t2, 4
        b    inner
next:
        addi $t0, $t0, -1
        b    outer
sort_end:
        jr   $ra

# void print(int *a, int n)
print:
        move $t0, $a0
        move $t1, $a1
print_loop:
        beqz $t1, print_end
        lw   $a0, 0($t0)
        li   $v0, 1
        syscall
        la   $a0, space
        li   $v0, 4
        syscall
        addi $t0, $t0, 4
        addi $t1, $t1, -1
        b    print_loop
print_end:
        la   $a0, nl
        li   $v0, 4
        syscall
        jr   $ra
