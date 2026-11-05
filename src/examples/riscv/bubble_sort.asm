# =====================================
#   SpimHub - Bubble sort of a .word array (RISC-V)
# =====================================

        .data
array:  .word 34, 7, 23, 32, 5, 62, -4, 18, 0, 11
size:   .word 10
space:  .asciz " "
nl:     .asciz "\n"

        .text
        .globl main
main:
        addi sp, sp, -4
        sw   ra, 0(sp)

        la   a0, array
        lw   a1, size
        call print

        la   a0, array
        lw   a1, size
        call sort

        la   a0, array
        lw   a1, size
        call print

        lw   ra, 0(sp)
        addi sp, sp, 4
        ret

# void sort(int *a, int n)
sort:
        addi t0, a1, -1                 # i = n - 1
outer:
        blez t0, sort_end
        li   t1, 0                      # j = 0
        mv   t2, a0                     # p = a
inner:
        bge  t1, t0, next
        lw   t3, 0(t2)
        lw   t4, 4(t2)
        ble  t3, t4, no_swap
        sw   t4, 0(t2)                  # swap a[j], a[j+1]
        sw   t3, 4(t2)
no_swap:
        addi t1, t1, 1
        addi t2, t2, 4
        j    inner
next:
        addi t0, t0, -1
        j    outer
sort_end:
        ret

# void print(int *a, int n)
print:
        mv   t0, a0
        mv   t1, a1
print_loop:
        beqz t1, print_end
        lw   a0, 0(t0)
        li   a7, 1
        ecall
        la   a0, space
        li   a7, 4
        ecall
        addi t0, t0, 4
        addi t1, t1, -1
        j    print_loop
print_end:
        la   a0, nl
        li   a7, 4
        ecall
        ret
