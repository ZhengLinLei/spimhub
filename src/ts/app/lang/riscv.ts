/*
    RISC-V (RV32IM) keywords for the highlighter (src/ts/app/format.ts)

    © 2023 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
*/

const __riscv_scope = (): LangScope => {
    const abi = [
        'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 'fp', 's1',
        'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
        's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
        't3', 't4', 't5', 't6',
    ];
    const x = Array.from({ length: 32 }, (_, i) => `x${i}`);
    return {
        meta : [
            '.align',  '.ascii',  '.asciz',  '.asciiz', '.balign', '.byte',
            '.data',   '.dword',  '.end',    '.equ',    '.eqv',    '.extern',
            '.file',   '.float',  '.double', '.global', '.globl',  '.half',
            '.option', '.p2align', '.section', '.set',  '.size',   '.skip',
            '.space',  '.string', '.text',   '.type',   '.word',   '.zero',
            '.rodata', '.bss',    '.kdata',  '.ktext',
        ],
        // Bare register names: matched as whole words (builtinWords)
        builtin : [...x, ...abi],
        builtinWords: true,
        keywords : /^(add|addi|sub|and|andi|or|ori|xor|xori|sll|slli|srl|srli|sra|srai|slt|slti|sltu|sltiu|lui|auipc|lb|lh|lw|lbu|lhu|sb|sh|sw|beq|bne|blt|bge|bltu|bgeu|jal|jalr|ecall|ebreak|fence|mul|mulh|mulhsu|mulhu|div|divu|rem|remu|nop|li|la|mv|not|neg|seqz|snez|sltz|sgtz|beqz|bnez|blez|bgez|bltz|bgtz|bgt|ble|bgtu|bleu|j|jr|ret|call|tail|subi)$/,
        comments : /(#|\/\/).*/,
        contains : {
            regexDynamic: {
                number : /\b(?:\b[2-9]_\d+|(?:\b\d+(?:\.\d+)?|\B\.\d+)(?:e-?\d+)?|\b0(?:[fd]_|x|b|o)[0-9a-f]+|&[0-9a-f]+)\b/g,
                string : /"(?:[^"\r\n]|"")*"/g,
                char : /'(?:[^'\r\n]{0,4}|'')'/g,
            },
            regexStatic: {
                punctuation : /[\(\)\,\:]/g,
                operator : /[\+\-\*%]/g,
            }
        }
    };
}
