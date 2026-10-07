// Tiny synthesized sound effects (no audio files needed).
let ctx = null;

function tone(freq, dur, type = 'sine', gain = 0.12, slideTo) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  },
  twist() { tone(220, 0.12, 'triangle', 0.08, 140); },
  pop(combo = 1) {
    const base = 520 * Math.pow(1.12, Math.min(combo - 1, 8));
    tone(base, 0.14, 'sine', 0.14, base * 1.6);
    setTimeout(() => tone(base * 1.5, 0.1, 'sine', 0.08), 40);
  },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.12), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 140)); },
};
