# Retro sounds

8-bit sounds made with square waves (Web Audio API):

- **jingle** (C E G C) when the program exits with code 0
- **buzz** when it fails (exception or exit code ≠ 0)
- **blip** when the code assembles

Turn them on / off with `[♪]` in the status bar or `sound on|off|test` in the terminal.

Fun fact: MARS and SPIM have MIDI syscalls (31, 33). This extension shows how an extension can react to the events of the simulator (`exit`, `error`, `assemble`).
