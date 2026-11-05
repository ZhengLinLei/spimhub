// Confetti when a program exits with code 0
// API: spimhub.on, spimhub.element, spimhub.command, spimhub.palette, spimhub.onDispose

const COLORS = ['#ADE792', '#F7D794', '#fb341e', '#55e3ff', '#b600b3', '#e90', '#ffffff'];
const canvas = spimhub.element('canvas');
canvas.className = 'spimhub-confetti';
const ctx = canvas.getContext('2d');
let parts = [];
let frame = 0;

const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
};
resize();
window.addEventListener('resize', resize);
spimhub.onDispose(() => window.removeEventListener('resize', resize));
spimhub.onDispose(() => cancelAnimationFrame(frame));

const tick = () => {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life-- > 0 && p.y < innerHeight + 20);
    for (const p of parts) {
        p.vy += 0.32;               // gravity
        p.vx *= 0.99;               // air
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
    }
    frame = parts.length ? requestAnimationFrame(tick) : 0;
};

const burst = (n = 160) => {
    for (let i = 0; i < n; i++) {
        parts.push({
            x: innerWidth / 2 + (Math.random() - 0.5) * 240,
            y: innerHeight * 0.4,
            vx: (Math.random() - 0.5) * 16,
            vy: -Math.random() * 15 - 5,
            r: 3 + Math.random() * 4,
            a: Math.random() * Math.PI * 2,
            va: (Math.random() - 0.5) * 0.3,
            color: COLORS[(Math.random() * COLORS.length) | 0],
            life: 110 + Math.random() * 70,
        });
    }
    if (!frame) frame = requestAnimationFrame(tick);
};

spimhub.on('exit', (e) => {
    if (e.code === 0) burst();
});
spimhub.command('confetti', 'throw confetti', () => burst(240));
spimhub.palette('confetti: celebrate', () => burst(240));
