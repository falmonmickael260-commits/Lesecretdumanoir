let ctx: AudioContext | null = null;
let ambience: ReturnType<typeof setInterval> | null = null;
let muted = false;

export function setMuted(value: boolean) { muted = value; if (muted && ambience) { clearInterval(ambience); ambience = null; } else if (!muted && ctx) startAmbience(); }
export function unlockAudio() { if (muted) return; ctx ||= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); startAmbience(); }

function tone(freq: number, duration: number, gain: number, type: OscillatorType, delay = 0) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator(); const amp = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.04);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(amp).connect(ctx.destination); osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + duration + 0.03);
}

function startAmbience() {
  if (ambience || !ctx || muted) return;
  let step = 0;
  const notes = [110, 164.81, 146.83, 130.81, 110, 174.61, 146.83, 98];
  ambience = setInterval(() => { tone(notes[step % notes.length], 1.75, 0.013, 'sine'); if (step % 4 === 0) tone(notes[step % notes.length] / 2, 3.5, 0.009, 'triangle'); step++; }, 1900);
}

export function sound(kind: 'step' | 'interact' | 'success' | 'door' | 'error', stage = 0) {
  if (!ctx || muted) return;
  if (kind === 'step') tone(stage === 2 || stage === 5 ? 118 : stage === 4 ? 94 : 72, 0.08, 0.014, stage === 2 || stage === 5 ? 'square' : 'triangle');
  if (kind === 'interact') { tone(350, 0.13, 0.025, 'sine'); tone(520, 0.18, 0.012, 'sine', 0.06); }
  if (kind === 'success') { [261.6, 329.6, 392, 523.2].forEach((n, i) => tone(n, 0.45, 0.03, 'sine', i * 0.1)); }
  if (kind === 'door') { tone(65, 0.75, 0.06, 'sawtooth'); tone(82, 1.1, 0.02, 'triangle', 0.15); }
  if (kind === 'error') tone(185, 0.18, 0.02, 'triangle');
}
