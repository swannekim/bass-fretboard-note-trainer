/**
 * Pitch detection for the tuner: the YIN algorithm (de Cheveigné & Kawahara,
 * 2002) on a short mono frame that the audio graph has already low-passed and
 * the caller has decimated to roughly 12 kHz.
 *
 * Bass open strings sit at 41–98 Hz, where phone microphones barely capture
 * the fundamental. YIN measures how often the waveform repeats instead of
 * which frequency is loudest, so it still lands on the fundamental from the
 * overtones alone. Its classic failure — locking onto the octave above when
 * the odd overtones are weak — is checked explicitly in `detectPitch`.
 */

export interface PitchEstimate {
  /** Fundamental frequency, Hz. */
  freq: number;
  /** 1 − YIN's normalised difference at the chosen period: near 1 = clean, below ~0.75 = unreliable. */
  clarity: number;
}

/** Root-mean-square level of the first `n` samples. */
export function rms(x: ArrayLike<number>, n: number = x.length): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i] * x[i];
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

/**
 * Average each run of `factor` samples into one (a cheap extra anti-alias
 * step on top of the audio graph's low-pass). Returns the number written.
 */
export function decimateInto(src: ArrayLike<number>, factor: number, dst: Float32Array): number {
  const n = Math.min(dst.length, Math.floor(src.length / factor));
  for (let i = 0; i < n; i++) {
    const base = i * factor;
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += src[base + k];
    dst[i] = sum / factor;
  }
  return n;
}

/**
 * YIN steps 2–3: the cumulative-mean-normalised difference d'(τ) for
 * τ = 0 … lagMax, over a window of n − lagMax samples. Writes into `out`.
 */
export function cmnd(x: ArrayLike<number>, n: number, lagMax: number, out: Float32Array): void {
  const w = n - lagMax;
  out[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= lagMax; tau++) {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      const diff = x[j] - x[j + tau];
      sum += diff * diff;
    }
    running += sum;
    out[tau] = running > 0 ? (sum * tau) / running : 1;
  }
}

function argMin(d: Float32Array, lo: number, hi: number): number {
  let best = lo;
  for (let t = lo + 1; t <= hi; t++) if (d[t] < d[best]) best = t;
  return best;
}

/** Sub-sample position and depth of the dip at `tau` (parabola through its neighbours). */
function refine(d: Float32Array, tau: number, lagMax: number): { lag: number; value: number } {
  if (tau < 1 || tau + 1 > lagMax) return { lag: tau, value: d[tau] };
  const a = d[tau - 1];
  const b = d[tau];
  const c = d[tau + 1];
  const curve = a - 2 * b + c;
  if (!(curve > 0)) return { lag: tau, value: b };
  const shift = (a - c) / (2 * curve);
  if (!(Math.abs(shift) < 1)) return { lag: tau, value: b };
  return { lag: tau + shift, value: b - ((a - c) * shift) / 4 };
}

/** The doubled lag must repeat better by at least this much (normalised) to win. */
const OCTAVE_MARGIN = 0.02;

export interface DetectOptions {
  /** YIN absolute threshold — the first dip below it wins (default 0.15). */
  threshold?: number;
  /** Largest d' still accepted when nothing dips under the threshold (default 0.3). */
  maxAperiodicity?: number;
}

/**
 * Fundamental of `x[0 … n)` sampled at `sampleRate`, searched between
 * `minHz` and `maxHz`. `scratch` must hold at least sampleRate / minHz + 2
 * values. Returns null when the frame is not periodic enough to trust.
 */
export function detectPitch(
  x: ArrayLike<number>,
  n: number,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  scratch: Float32Array,
  options: DetectOptions = {},
): PitchEstimate | null {
  const threshold = options.threshold ?? 0.15;
  const maxAperiodicity = options.maxAperiodicity ?? 0.3;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.ceil(sampleRate / minHz), Math.floor(n / 2) - 1, scratch.length - 2);
  if (tauMax - tauMin < 3) return null;
  const lagMax = tauMax + 1;
  cmnd(x, n, lagMax, scratch);

  // Step 4 — absolute threshold: the first dip under it, followed to its bottom.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (scratch[t] < threshold) {
      let bottom = t;
      while (bottom + 1 <= tauMax && scratch[bottom + 1] < scratch[bottom]) bottom++;
      tau = bottom;
      break;
    }
  }
  if (tau < 0) {
    tau = argMin(scratch, tauMin, tauMax);
    if (scratch[tau] > maxAperiodicity) return null;
  }

  // Octave check — with weak odd overtones the half period repeats almost as
  // well as the whole one. When the doubled lag repeats clearly better, it is
  // the real period (the note an octave lower). Compare the interpolated dip
  // depths: at whole-sample lags a dip's depth mostly reflects how close the
  // true period falls to a sample, which would make clean notes flip octaves.
  const radius = Math.max(2, Math.round(tau * 0.04));
  const lo = 2 * tau - radius;
  const hi = Math.min(tauMax, 2 * tau + radius);
  if (lo >= tauMin && lo < hi) {
    const doubled = argMin(scratch, lo, hi);
    const here = Math.max(0, refine(scratch, tau, lagMax).value);
    const there = Math.max(0, refine(scratch, doubled, lagMax).value);
    if (there < here * 0.5 && here - there > OCTAVE_MARGIN && there <= maxAperiodicity) tau = doubled;
  }

  const { lag, value } = refine(scratch, tau, lagMax);
  if (!(lag > 0)) return null;
  return { freq: sampleRate / lag, clarity: 1 - Math.min(1, Math.max(0, value)) };
}
