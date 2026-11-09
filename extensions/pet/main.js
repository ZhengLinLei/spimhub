// SpimHub pet: the creature of the SpimHub logo living in the corner.
// It reacts to the events of the simulator and teaches a few things.
// Texts in the language of the interface: spimhub.t({ en, es, pt, it, fr })

const TIPS = [
    { en: 'MIPS has 32 registers; $zero is always 0.', es: 'MIPS tiene 32 registros; $zero siempre vale 0.', pt: 'MIPS tem 32 registradores; $zero vale sempre 0.', it: 'MIPS ha 32 registri; $zero vale sempre 0.', fr: 'MIPS a 32 registres ; $zero vaut toujours 0.' },
    { en: 'In RISC-V the registers have no "$": t0, a0, sp...', es: 'En RISC-V los registros no llevan "$": t0, a0, sp...', pt: 'No RISC-V os registradores não têm "$": t0, a0, sp...', it: 'In RISC-V i registri non hanno "$": t0, a0, sp...', fr: 'En RISC-V les registres n’ont pas de « $ » : t0, a0, sp...' },
    { en: 'jal saves the return address in $ra (MIPS) or ra (RISC-V).', es: 'jal guarda la dirección de retorno en $ra (MIPS) o ra (RISC-V).', pt: 'jal guarda o endereço de retorno em $ra (MIPS) ou ra (RISC-V).', it: 'jal salva l’indirizzo di ritorno in $ra (MIPS) o ra (RISC-V).', fr: 'jal sauve l’adresse de retour dans $ra (MIPS) ou ra (RISC-V).' },
    { en: 'Save $ra on the stack before calling another function!', es: '¡Guarda $ra en la pila antes de llamar a otra función!', pt: 'Salve $ra na pilha antes de chamar outra função!', it: 'Salva $ra nello stack prima di chiamare un’altra funzione!', fr: 'Sauvez $ra sur la pile avant d’appeler une autre fonction !' },
    { en: 'A load followed by its use costs 1 stall: the load-use hazard.', es: 'Un load seguido de su uso cuesta 1 parada: el riesgo load-use.', pt: 'Um load seguido do seu uso custa 1 parada: o hazard load-use.', it: 'Un load seguito dal suo uso costa 1 stallo: l’hazard load-use.', fr: 'Un load suivi de son utilisation coûte 1 suspension : l’aléa load-use.' },
    { en: 'Forwarding sends the ALU result to the next instruction.', es: 'El forwarding envía el resultado de la ALU a la siguiente instrucción.', pt: 'O forwarding envia o resultado da ULA para a próxima instrução.', it: 'Il forwarding invia il risultato dell’ALU all’istruzione successiva.', fr: 'Le forwarding envoie le résultat de l’UAL à l’instruction suivante.' },
    { en: 'A taken branch flushes the instructions fetched after it.', es: 'Un salto tomado descarta las instrucciones buscadas después.', pt: 'Um desvio tomado descarta as instruções buscadas depois dele.', it: 'Un salto preso scarta le istruzioni prelevate dopo di esso.', fr: 'Un branchement pris vide les instructions lues après lui.' },
    { en: 'lui + ori (MIPS) / lui + addi (RISC-V) build 32-bit constants.', es: 'lui + ori (MIPS) / lui + addi (RISC-V) construyen constantes de 32 bits.', pt: 'lui + ori (MIPS) / lui + addi (RISC-V) montam constantes de 32 bits.', it: 'lui + ori (MIPS) / lui + addi (RISC-V) creano costanti a 32 bit.', fr: 'lui + ori (MIPS) / lui + addi (RISC-V) construisent des constantes 32 bits.' },
    { en: 'The stack grows down: addi $sp, $sp, -8 to make room.', es: 'La pila crece hacia abajo: addi $sp, $sp, -8 para hacer sitio.', pt: 'A pilha cresce para baixo: addi $sp, $sp, -8 para abrir espaço.', it: 'Lo stack cresce verso il basso: addi $sp, $sp, -8 per fare spazio.', fr: 'La pile croît vers le bas : addi $sp, $sp, -8 pour faire de la place.' },
    { en: 'Words are 4 bytes and must be aligned to 4.', es: 'Las palabras ocupan 4 bytes y deben estar alineadas a 4.', pt: 'As palavras têm 4 bytes e devem estar alinhadas a 4.', it: 'Le parole sono di 4 byte e devono essere allineate a 4.', fr: 'Les mots font 4 octets et doivent être alignés sur 4.' },
    { en: 'syscall 10 / ecall with a7 = 10 ends the program.', es: 'syscall 10 / ecall con a7 = 10 termina el programa.', pt: 'syscall 10 / ecall com a7 = 10 encerra o programa.', it: 'syscall 10 / ecall con a7 = 10 termina il programma.', fr: 'syscall 10 / ecall avec a7 = 10 termine le programme.' },
    { en: 'Open [pipeline] (Alt + L) and step cycle by cycle.', es: 'Abre [pipeline] (Alt + L) y avanza ciclo a ciclo.', pt: 'Abra [pipeline] (Alt + L) e avance ciclo a ciclo.', it: 'Apri [pipeline] (Alt + L) e avanza ciclo per ciclo.', fr: 'Ouvrez [pipeline] (Alt + L) et avancez cycle par cycle.' },
    { en: 'Ctrl + Shift + P opens the command palette.', es: 'Ctrl + Shift + P abre la paleta de comandos.', pt: 'Ctrl + Shift + P abre a paleta de comandos.', it: 'Ctrl + Shift + P apre la tavolozza dei comandi.', fr: 'Ctrl + Maj + P ouvre la palette de commandes.' },
    { en: 'Drop .asm files on the page to import them.', es: 'Suelta archivos .asm en la página para importarlos.', pt: 'Solte arquivos .asm na página para importá-los.', it: 'Trascina file .asm sulla pagina per importarli.', fr: 'Déposez des fichiers .asm sur la page pour les importer.' },
];
const MSG = {
    hi: { en: 'hi! click me for a tip', es: '¡hola! haz clic para un consejo', pt: 'oi! clique em mim para uma dica', it: 'ciao! cliccami per un consiglio', fr: 'salut ! cliquez pour une astuce' },
    again: { en: 'hi again!', es: '¡hola otra vez!', pt: 'oi de novo!', it: 'ciao di nuovo!', fr: 're-bonjour !' },
    errors: { en: '{n} error(s)... check [console]', es: '{n} error(es)... mira la [consola]', pt: '{n} erro(s)... veja o [console]', it: '{n} errore/i... guarda la [console]', fr: '{n} erreur(s)... voir la [console]' },
    ready: { en: '{arch} code, {n} instructions. Ready!', es: 'código {arch}, {n} instrucciones. ¡Listo!', pt: 'código {arch}, {n} instruções. Pronto!', it: 'codice {arch}, {n} istruzioni. Pronto!', fr: 'code {arch}, {n} instructions. Prêt !' },
    running: { en: 'running...', es: 'ejecutando...', pt: 'executando...', it: 'in esecuzione...', fr: 'exécution...' },
    done: { en: 'done! {n} instructions 🎉', es: '¡hecho! {n} instrucciones 🎉', pt: 'pronto! {n} instruções 🎉', it: 'fatto! {n} istruzioni 🎉', fr: 'terminé ! {n} instructions 🎉' },
    code: { en: 'exit code {n}', es: 'código de salida {n}', pt: 'código de saída {n}', it: 'codice di uscita {n}', fr: 'code de sortie {n}' },
    saved: { en: 'saved ✔', es: 'guardado ✔', pt: 'salvo ✔', it: 'salvato ✔', fr: 'enregistré ✔' },
};
const say = (key, vars = {}) => spimhub.t(MSG[key]).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const pick = (a) => a[(Math.random() * a.length) | 0];
const tip = () => spimhub.t(pick(TIPS));

// ---- DOM ----
const pet = spimhub.element('div');
pet.className = 'spimhub-pet';
pet.innerHTML = `
    <div class="pet-bubble"></div>
    <svg class="pet-body" viewBox="0 0 100 79" xmlns="http://www.w3.org/2000/svg">
        <path class="pet-head" d="M72.5691 28.1201C68.8572 28.1201 65.8515 31.1294 65.8515 34.8395C65.8515 38.5497 68.8572 41.5589 72.5691 41.5589C76.2775 41.5589 79.2885 38.5497 79.2885 34.8395C79.2885 31.1294 76.2775 28.1201 72.5691 28.1201ZM28.2187 28.1201C24.505 28.1201 21.4994 31.1294 21.4994 34.8395C21.4994 38.5497 24.5068 41.5589 28.2187 41.5589C31.9289 41.5589 34.9363 38.5497 34.9363 34.8395C34.9363 31.1294 31.9289 28.1201 28.2187 28.1201ZM9.50678 19.6483C8.19512 18.3314 7.54195 16.6073 7.54195 14.8938C7.54195 13.1715 8.19512 11.4491 9.50678 10.1375C10.8255 8.82759 12.5408 8.17442 14.2613 8.17442C15.9837 8.17442 17.706 8.82759 19.0159 10.1375L17.4458 11.2969C26.5389 4.22528 37.9739 0 50.393 0C62.8158 0 74.2348 4.22351 83.3403 11.2969L81.7755 10.1428C83.0872 8.83113 84.8042 8.17796 86.5301 8.17796C88.2471 8.17796 89.9712 8.83113 91.2793 10.1428C92.5857 11.4615 93.2388 13.1839 93.2388 14.8973C93.2388 16.6214 92.591 18.342 91.2793 19.6537L92.8476 20.806C115.567 43.5237 76.8971 53.7533 76.8971 53.7533H23.8908C22.7756 53.7533 -16.3635 45.108 7.94022 20.806L9.50678 19.6483Z"/>
        <path class="pet-foot" d="M85.8273 77.7491C81.3135 77.7491 77.6547 74.0902 77.6547 69.5746C77.6547 65.0608 81.3135 61.402 85.8273 61.402C90.3412 61.402 94 65.0608 94 69.5746C94.0018 74.0902 90.3412 77.7491 85.8273 77.7491Z"/>
        <path class="pet-foot" d="M18.676 78.4925C14.1604 78.4925 10.5016 74.8336 10.5016 70.318C10.5016 65.8042 14.1604 62.1454 18.676 62.1454C23.1916 62.1454 26.8504 65.8042 26.8504 70.318C26.8504 74.8336 23.1916 78.4925 18.676 78.4925Z"/>
        <path class="pet-mouth" d="M25.9406 55.442H75.019C75.019 55.442 51.225 63.62 25.9406 55.442Z"/>
    </svg>
    <div class="pet-zzz">z<sup>z</sup><sup><sup>z</sup></sup></div>`;
const bubble = pet.querySelector('.pet-bubble');

// ---- State ----
let timer = 0, sleeper = 0;
const mood = (name, text, ms = 3500) => {
    pet.className = `spimhub-pet ${name}`;
    if (!visible()) pet.classList.add('hidden');
    if (text) {
        bubble.textContent = text;
        bubble.classList.add('show');
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
        bubble.classList.remove('show');
        pet.classList.remove('happy', 'sad', 'busy', 'talk');
    }, ms);
    clearTimeout(sleeper);
    sleeper = setTimeout(() => pet.classList.add('sleep'), 90000);
};
spimhub.onDispose(() => { clearTimeout(timer); clearTimeout(sleeper); });

const visible = () => spimhub.storage.get('visible', true);
const toggle = () => {
    spimhub.storage.set('visible', !visible());
    pet.classList.toggle('hidden', !visible());
    if (visible()) mood('happy', say('again'));
};
pet.classList.toggle('hidden', !visible());

// ---- Events ----
spimhub.on('assemble', (e) => {
    if (!e.ok) mood('sad', say('errors', { n: e.program.errors.length }));
    else mood('talk', say('ready', { arch: e.program.arch === 'riscv' ? 'RISC-V' : 'MIPS', n: e.program.text.filter(t => !t.boot).length }));
});
spimhub.on('run', () => mood('busy', say('running'), 1500));
spimhub.on('exit', (e) => mood('happy', e.code === 0 ? say('done', { n: e.steps }) : say('code', { n: e.code })));
spimhub.on('error', (e) => mood('sad', String(e.message).replace(/^Exception \d+ /, '').slice(0, 90), 6000));
spimhub.on('file-save', () => mood('talk', say('saved'), 1500));
spimhub.on('lang', () => mood('talk', tip(), 5000));

pet.addEventListener('click', () => mood('talk', tip(), 6000));

// ---- Commands ----
spimhub.command('pet', 'show / hide the pet, or ask for a tip: pet tip', (args, term) => {
    if (args[0] === 'tip') { const t = tip(); term.print(t); mood('talk', t, 6000); }
    else toggle();
});
spimhub.palette('pet: show / hide', toggle);
spimhub.palette('pet: give me a tip', () => mood('talk', tip(), 6000));

mood('happy', say('hi'), 4000);
