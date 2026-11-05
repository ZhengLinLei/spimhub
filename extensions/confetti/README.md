# Confetti

Throws confetti every time a program ends with **exit code 0** (`syscall 10` in MIPS, `ecall` with `a7 = 10` in RISC-V).

- Terminal: `confetti`
- Command palette: `confetti: celebrate`

## How it works

```js
spimhub.on('exit', (e) => {
    if (e.code === 0) burst();
});
```

A `<canvas>` over the page (created with `spimhub.element`) draws the paper with a bit of gravity. Read `main.js`: it is a good first extension to copy.
