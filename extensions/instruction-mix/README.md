# Instruction mix

Counts the instructions **executed** in the last run (the dynamic count, not the lines of the source):

- by class: ALU, mul / div, load, store, branch, jump, syscall...
- the 10 most used instructions
- percentage of taken branches
- CPI, stalls and flushes of the 5 stage pipeline model

Open it from the status bar (`[mix]`), the command palette (`instruction mix: show`) or the terminal (`mix`).

## Exercise

Run `/examples/pipeline/riscv_sum_loop.asm`, note the CPI and the share of loads and branches. Unroll the loop and compare.

## Data used

```js
spimhub.spim.trace              // every executed instruction: { pc, basic, deps: { kind }, taken }
spimhub.spim.pipeline.stats()   // { cycles, instructions, cpi, stalls, flushes, forwards }
```
