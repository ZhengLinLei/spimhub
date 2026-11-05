// Retro sounds with the Web Audio API (square waves, like the old consoles)

let audio = null;
const ctx = () => (audio = audio || new (window.AudioContext || window.webkitAudioContext)());
spimhub.onDispose(() => audio && audio.close());

const on = () => spimhub.storage.get('on', true);

// notes: [frequency Hz, duration s]
const play = (notes, type = 'square', volume = 0.06) => {
    if (!on()) return;
    const ac = ctx();
    let t = ac.currentTime + 0.02;
    notes.forEach(([f, d]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + d);
        t += d * 0.9;
    });
};

const SOUND = {
    success: [[523, .09], [659, .09], [784, .09], [1047, .22]],          // C E G C
    error: [[220, .14], [185, .14], [147, .3]],
    assembled: [[880, .05], [1175, .07]],
    fail: [[110, .12], [110, .12]],
};

spimhub.on('exit', (e) => play(e.code === 0 ? SOUND.success : SOUND.error));
spimhub.on('error', () => play(SOUND.error, 'sawtooth'));
spimhub.on('assemble', (e) => play(e.ok ? SOUND.assembled : SOUND.fail, e.ok ? 'square' : 'sawtooth'));

const item = spimhub.status(on() ? '[♪]' : '[♪ off]', () => toggle(), 'Retro sounds on / off');
const toggle = () => {
    spimhub.storage.set('on', !on());
    item.set(on() ? '[♪]' : '[♪ off]');
    if (on()) play(SOUND.assembled);
};

spimhub.command('sound', 'retro sounds: sound on | off | test', (args, term) => {
    if (args[0] === 'test') { play(SOUND.success); return; }
    if (args[0] === 'on' || args[0] === 'off') {
        if ((args[0] === 'on') !== on()) toggle();
    }
    term.print(`sounds ${on() ? 'on' : 'off'}`);
});
