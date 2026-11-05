# =====================================
#   SpimHub - Pipeline hazards (MIPS)
#
#   Open the [pipeline] view (Alt + L) and step cycle by cycle.
#   Toggle [forwarding] and [branch: EX/ID] to see how the CPI changes.
#   (SPIM does not simulate delay slots: branches are predicted not taken)
#
#   1. RAW  ALU -> ALU           forwarding EX/MEM -> EX (no stall)
#   2. RAW  distance 2           forwarding MEM/WB -> EX (no stall)
#   3. Load-use                  1 stall even with forwarding
#   4. Load-use avoided          the compiler reorders an instruction
#   5. Store after load          forwarding MEM/WB -> MEM (store data)
#   6. Taken branch (loop)       the next instructions are flushed
# =====================================

        .data
vec:    .word 1, 2, 3, 4
out:    .word 0

        .text
        .globl main
main:
        # ---- 1. RAW: $t0 is used by the next instruction ----
        addi $t0, $zero, 5
        add  $t1, $t0, $t0      # $t0 forwarded EX/MEM -> EX

        # ---- 2. RAW at distance 2 ----
        addi $t2, $zero, 7
        nop
        add  $t3, $t2, $t2      # $t2 forwarded MEM/WB -> EX

        # ---- 3. Load-use ----
        la   $a0, vec
        lw   $t4, 0($a0)
        add  $t5, $t4, $t4      # 1 stall: the value exists after MEM

        # ---- 4. Same code reordered: no stall ----
        lw   $t4, 4($a0)
        addi $a1, $zero, 1      # independent instruction fills the slot
        add  $t5, $t4, $t4

        # ---- 5. Load -> store data ----
        lw   $t6, 8($a0)
        sw   $t6, 12($a0)       # $t6 forwarded MEM/WB -> MEM

        # ---- 6. Loop: taken branches flush the wrong path ----
        li   $s0, 3
loop:
        addi $s0, $s0, -1
        bnez $s0, loop          # taken twice -> flushes

        li   $v0, 10
        syscall
