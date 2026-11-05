/*

    Format.js
    =========
    Format.js is a simple library for formatting code. It is designed to be used in the browser, 
    but it can also be used in Node.js. It is written in ES6, but it is transpiled to ES5 using Babel. It is also minified using UglifyJS.

    This the highligter of SpimHub project


     ▄▀▀▀▀▄  ▄▀▀▄▀▀▀▄  ▄▀▀█▀▄    ▄▀▀▄ ▄▀▄  ▄▀▀▄ ▄▄   ▄▀▀▄ ▄▀▀▄  ▄▀▀█▄▄  
    █ █   ▐ █   █   █ █   █  █  █  █ ▀  █ █  █   ▄▀ █   █    █ ▐ ▄▀   █ 
       ▀▄   ▐  █▀▀▀▀  ▐   █  ▐  ▐  █    █ ▐  █▄▄▄█  ▐  █    █    █▄▄▄▀  
    ▀▄   █     █          █       █    █     █   █    █    █     █   █  
     █▀▀▀    ▄▀        ▄▀▀▀▀▀▄  ▄▀   ▄▀     ▄▀  ▄▀     ▀▄▄▄▄▀   ▄▀▄▄▄▀  
     ▐      █         █       █ █    █     █   █               █    ▐   
            ▐         ▐       ▐ ▐    ▐     ▐   ▐               ▐        
     ▄▀▀▀█▄    ▄▀▀▀▀▄   ▄▀▀▄▀▀▀▄  ▄▀▀▄ ▄▀▄  ▄▀▀█▄   ▄▀▀▀█▀▀▄            
    █  ▄▀  ▀▄ █      █ █   █   █ █  █ ▀  █ ▐ ▄▀ ▀▄ █    █  ▐            
    ▐ █▄▄▄▄   █      █ ▐  █▀▀█▀  ▐  █    █   █▄▄▄█ ▐   █                
     █    ▐   ▀▄    ▄▀  ▄▀    █    █    █   ▄▀   █    █                 
     █          ▀▀▀▀   █     █   ▄▀   ▄▀   █   ▄▀   ▄▀                  
    █                  ▐     ▐   █    █    ▐   ▐   █                    
    ▐                            ▐    ▐            ▐                    
    MIT License
    ===========

    © 2023 ZhengLinLei <zheng9112003@icloud.com>

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
    LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
    OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
    WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


*/

class Format {
    static capitalize(string: string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    static capitalizeAll(string: string) {
        return string.split(" ").map(word => this.capitalize(word)).join(" ");
    }
    

    // Language scope (see src/ts/app/lang/mips.ts)
    private _data: LangScope;

    constructor(getLang: LangScope) {

        if (!getLang || Object.keys(getLang).length === 0) {
            throw new Error('Please enter specific language scope regex');
        }

        this._data = getLang;
    }

    // Set option scope
    get data() {
        return this._data;
    }
    set data(value) {
        this._data = value;
    }

    DestroyCode(code) {
        return code.map(code => code.map(() => null));
    }

    JoinCode(code) {
        return code.map(line => `<p>${(line) ? line : " "}</p>`).join("\n");
    }

    /* Static functions */
    // ===================
    RNFC(code, formattedCode) {
        // =================== 
        let __f_numbers = this._data.contains.regexDynamic.number;
        let __f_builtin = this._data.builtin;
        let __f_words = this._data.builtinWords
            ? new RegExp(`(^|[\\s(])(${[...__f_builtin].sort((a, b) => b.length - a.length).join('|')})(?=$|[\\s)])`, 'g')
            : null;

        // =================== Process numbers and registers
        code.forEach((line, i1) => {
            line.forEach((word, i2) => {

                // $s0, 0 ----> will replace all 0, split ino ['$s0', '0'] and make a match to prevent printing 0 as a number before $s0
                // Split by comma
                let _word = word.split(',');

                _word = _word.map((w) => {
                    // Register first
                    let matches = [];
                    if (__f_words) {
                        // Bare register names (RISC-V): whole words only, "ra" is not inside "array"
                        w = w.replace(__f_words, '$1<span class=__f_builtin>$2</span>');
                    } else {
                        __f_builtin.forEach((builtin) => { if(w.includes(builtin)) matches.push(builtin) });
                    }

                    // Remove duplicates
                    [...new Set(matches)].sort().reverse().forEach((match) => {
                        w = w.replaceAll(match, `<span class=__f_builtin>${match}</span>`);
                    });

                    // Then numbers
                    matches = w.match(__f_numbers);

                    // Remove duplicates
                    [...new Set(matches)].sort().reverse()
                    .forEach((match) => {
                        w = w.replaceAll(match, `<span class=__f_numbers>${match}</span>`);
                    });

                    return w;
                });

                code[i1][i2] = _word.join(',');
            });
        });

        return code;
    };

    BFC(code, formattedCode) {

        // ===================
        let __staticWords = {
            __f_meta: this._data.meta,
            __f_keywords: this._data.keywords,
            __f_builtin:  this._data.builtin,
        };

        Object.keys(__staticWords).forEach((key) => {
            code.forEach((line, index) => {
                line.forEach((word, index2) => {
                    if (formattedCode[index][index2] === null) {
                        let html = null;

                        // If word match replaceAll
                        if (key === "__f_meta") {
                            if(__staticWords[key].includes(word))
                                html = `<span class=__f_meta>${word}</span>`;
                        } else 

                        // If entire word match keyword
                        if (key === "__f_keywords") {
                            if(__staticWords[key].test(word))
                                html = `<span class=__f_keywords>${word}</span>`;
                        } else

                        // If word match replace builtin variables
                        if (key === "__f_builtin") {

                            html = word;
                            // Whole word registers were already formatted by RNFC
                            if (this._data.builtinWords) {
                                formattedCode[index][index2] = html;
                                return;
                            }

                            let matches = [];
                            __staticWords["__f_builtin"].forEach((builtin) => { if(word.includes(builtin)) matches.push(builtin) });

                            // Remove duplicates
                            matches = [...new Set(matches)].sort().reverse();

                            matches.forEach((match) => {
                                html = html.replaceAll(match, `<span class=__f_builtin>${match}</span>`);
                            });
                        }

                        // Set formated word
                        formattedCode[index][index2] = html;
                    }
                });
            });
        });

        return formattedCode;
    };

    AFC(code, formattedCode) {
        let __dynamicWords = {
            __f_strings: this._data.contains.regexDynamic.string,
            __f_chars: this._data.contains.regexDynamic.char,
            __f_punctuation: this._data.contains.regexStatic.punctuation,
            __f_operators: this._data.contains.regexStatic.operator,
        };
        formattedCode = formattedCode.map(line => {
            let pushMatches = [];
            Object.keys(__dynamicWords).forEach((key) => {
                let matches = line.match(__dynamicWords[key]);
                if (matches) {
                    matches.forEach((match) => {
                        pushMatches.push({match, key});
                    });
                }
            });
            // Remove duplicates .match are unique
            //
            pushMatches = pushMatches.filter((v,i,a)=>a.findIndex(v2=>(v2.match===v.match))===i)

            if (pushMatches.length > 0) {
                pushMatches.forEach((match) => {
                    line = line.replaceAll(match.match, `<span class=${match.key}>${match.match}</span>`);
                });
            };

            return line;
        });

        return formattedCode;
    };

    FC(code, formattedCode) {
        return formattedCode.map(line => line.join(" "))
        .map(line => {
            let comment = line.match(this._data.comments);

            if (comment !== null) {
                let commentIndex = line.indexOf(comment[0]);
                let commentWord = line.slice(commentIndex);
                let commentWordFormated = `<span class=__f_comment>${commentWord}</span>`;
                return line.slice(0, commentIndex) + commentWordFormated;

                /**
                 * @property {() => string} value
                 * line.replace(comment[0], `<span class="__f_comment">${comment[0]}</span>`);
                 */

            }

            return line;
        });
    }
    NullCopyCode(code, formattedCode) {
        code.forEach((line, index) => {
            line.forEach((word, index2) => {
                if (formattedCode[index][index2] === null) {
                    formattedCode[index][index2] = word;
                }
            });
        });

        return formattedCode;
    }
    // ===================

    // Formate code
    formateCode(codeArr) {
        let code = codeArr.map(code => code.split(" "));

        let formattedCode = this.DestroyCode(code);

        // Formate all registers and numbers        
        code = this.RNFC(code, formattedCode);

        // Formate all static words first
        formattedCode = this.BFC(code, formattedCode);

        // Copy all not formated words
        formattedCode = this.NullCopyCode(code, formattedCode);

        // Formate comments after joined all words
        formattedCode = this.FC(code, formattedCode);

        // Formate all dynamic words
        formattedCode = this.AFC(code, formattedCode);

        // Join all formated code
        formattedCode = this.JoinCode(formattedCode);



        return formattedCode;
    }


}