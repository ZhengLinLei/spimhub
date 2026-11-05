# Number converter

One 32-bit word seen in every way: hexadecimal, binary, signed (two's complement), unsigned, IEEE-754 float (sign, exponent, fraction), bytes in little endian order and ASCII.

## Terminal

```
conv 42
conv -1
conv 0x7fffffff
conv 0b1010
conv 'A'
conv 3.5
```

## Panel

Open it from the command palette (`converter: open`) or from this page. The table changes while you type; click a value to copy it.

Try `conv -1` and `conv 0xffffffff`: the same bits, two numbers. That is two's complement.
