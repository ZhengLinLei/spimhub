# SpimHub pet

The creature of the SpimHub logo lives in the bottom left corner (over the explorer):

- **jumps** when a program ends well
- **cries** when an exception stops the program or the code does not assemble
- **talks** when you assemble or save
- **sleeps** when you leave it alone for a while
- **click it** for a MIPS / RISC-V / pipeline tip

Terminal: `pet` (show / hide), `pet tip`.

## Events used

```js
spimhub.on('assemble', (e) => ...);   // { ok, program, route }
spimhub.on('exit', (e) => ...);       // { code, steps }
spimhub.on('error', (e) => ...);      // { message }
```

Its visibility is saved with `spimhub.storage`.
