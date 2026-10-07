/**
 * Plucked-bass synthesizer — extended Karplus–Strong string model rendered
 * into an AudioBuffer per pluck, entirely in the browser (no audio files).
 *
 * The AudioContext is created lazily inside the first user gesture (iOS and
 * Chrome require that) and re-resumed on gesture END events too, because a
 * touch `pointerdown` alone is not a user activation on every platform.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;

  let created: AudioContext;
  try {
    created = new Ctor({ latencyHint: "interactive" });
  } catch {
    created = new Ctor();
  }
  ctx = created;

  // Master chain: gentle compression so four ringing strings never clip.
  const comp = created.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master = created.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  comp.connect(created.destination);

  const unlock = () => {
    if (ctx && ctx.state !== "running") void ctx.resume();
  };
  // Pointer/touch-release unlocks (iOS needs a gesture-end to resume audio) are
  // wired on the full-viewport app root in home.tsx via `unlockAudio`.
  window.addEventListener("keyup", unlock, { passive: true });
  return created;
}

/** Create/resume the context from inside a user gesture. */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state !== "running") void c.resume();
}

/**
 * Synthesize one plucked string at `freq` Hz. Polyphonic: every call creates
 * its own source → tone filter → envelope chain feeding the shared master.
 */
export function pluck(freq: number, velocity = 1): void {
  const c = getContext();
  if (!c || !master) return;
  if (c.state !== "running") void c.resume();

  const sr = c.sampleRate;
  const duration = 2.2;
  const length = Math.floor(sr * duration);

  // ── Karplus–Strong loop with fractional-delay tuning ────────────────────
  const period = sr / freq;
  const n = Math.max(2, Math.floor(period - 0.5));
  const frac = period - 0.5 - n; // 0 … 1, absorbed by the allpass below
  const allpass = (1 - frac) / (1 + frac);
  // Loop gain so the fundamental halves about every second; the averaging
  // filter makes upper harmonics fade faster, like a real string.
  const rho = Math.pow(0.5, 1 / (freq * 1.0));

  const line = new Float32Array(n);
  let prev = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    // Two-point average twice: a rounder, finger-style excitation.
    const soft = 0.5 * (white + prev);
    prev = white;
    line[i] = soft;
    mean += soft;
  }
  mean /= n;
  for (let i = 0; i < n; i++) line[i] -= mean; // no DC thump

  const out = new Float32Array(length);
  let ptr = 0;
  let lastX = line[n - 1];
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < length; i++) {
    const x = line[ptr];
    const lp = 0.5 * (x + lastX);
    lastX = x;
    const ap = allpass * (lp - apY) + apX;
    apX = lp;
    apY = ap;
    const v = ap * rho;
    line[ptr] = v;
    out[i] = v;
    ptr = ptr + 1 === n ? 0 : ptr + 1;
  }

  const buffer = c.createBuffer(1, length, sr);
  buffer.copyToChannel(out, 0);

  // ── Voice chain ─────────────────────────────────────────────────────────
  const source = c.createBufferSource();
  source.buffer = buffer;

  // Tame the KS brightness while keeping enough harmonics for phone speakers.
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = Math.min(2600, Math.max(900, freq * 14));
  tone.Q.value = 0.8;

  const env = c.createGain();
  const now = c.currentTime;
  const peak = 0.6 * velocity;
  env.gain.setValueAtTime(peak, now);
  env.gain.setValueAtTime(peak, now + 0.04);
  env.gain.exponentialRampToValueAtTime(peak * 0.06, now + 1.8);
  env.gain.linearRampToValueAtTime(0, now + 2.1);

  source.connect(tone);
  tone.connect(env);
  env.connect(master);
  source.start(now);
  source.stop(now + 2.15);
  source.onended = () => {
    source.disconnect();
    tone.disconnect();
    env.disconnect();
  };
}
