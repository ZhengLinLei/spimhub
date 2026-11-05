// SpimHub pet: the creature of the SpimHub logo living in the corner.
// It reacts to the events of the simulator and teaches a few things.

const TIPS = [
    'MIPS has 32 registers; $zero is always 0.',
    'In RISC-V the registers have no "$": t0, a0, sp...',
    'jal saves the return address in $ra (MIPS) or ra (RISC-V).',
    'Save $ra on the stack before calling another function!',
    'A load followed by its use costs 1 stall: the load-use hazard.',
    'Forwarding sends the ALU result to the next instruction.',
    'A taken branch flushes the instructions fetched after it.',
    'lui + ori (MIPS) / lui + addi (RISC-V) build 32-bit constants.',
    'The stack grows down: addi $sp, $sp, -8 to make room.',
    'Words are 4 bytes and must be aligned to 4.',
    'syscall 10 / ecall with a7 = 10 ends the program.',
    'Open [pipeline] (Alt + L) and step cycle by cycle.',
    'Ctrl + Shift + P opens the command palette.',
    'Drop .asm files on the page to import them.',
];
const pick = (a) => a[(Math.random() * a.length) | 0];

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
    if (visible()) mood('happy', 'hi again!');
};
pet.classList.toggle('hidden', !visible());

// ---- Events ----
spimhub.on('assemble', (e) => {
    if (!e.ok) mood('sad', `${e.program.errors.length} error${e.program.errors.length === 1 ? '' : 's'}... check [console]`);
    else mood('talk', `${e.program.arch === 'riscv' ? 'RISC-V' : 'MIPS'} code, ${e.program.text.filter(t => !t.boot).length} instructions. Ready!`);
});
spimhub.on('run', () => mood('busy', 'running...', 1500));
spimhub.on('exit', (e) => mood('happy', e.code === 0 ? `done! ${e.steps} instructions 🎉` : `exit code ${e.code}`));
spimhub.on('error', (e) => mood('sad', String(e.message).replace(/^Exception \d+ /, '').slice(0, 90), 6000));
spimhub.on('file-save', () => mood('talk', 'saved ✔', 1500));

pet.addEventListener('click', () => mood('talk', pick(TIPS), 6000));

// ---- Commands ----
spimhub.command('pet', 'show / hide the pet, or ask for a tip: pet tip', (args, term) => {
    if (args[0] === 'tip') { const t = pick(TIPS); term.print(t); mood('talk', t, 6000); }
    else toggle();
});
spimhub.palette('pet: show / hide', toggle);
spimhub.palette('pet: give me a tip', () => mood('talk', pick(TIPS), 6000));

mood('happy', 'hi! click me for a tip', 4000);
