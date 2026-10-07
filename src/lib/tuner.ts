import type { NoteName } from "./fretboard";

/**
 * Tuner model: the four standard-tuning targets, the cents maths, and a small
 * tracker that turns noisy per-frame pitch readings into a steady needle,
 * an up/down hint, and a "hold it in tune → pass" check per string.
 */

export interface TuneTarget {
  /** Row index matching the fretboard (0 = 1번줄 G … 3 = 4번줄 E). */
  row: number;
  number: 1 | 2 | 3 | 4;
  note: NoteName;
  /** Standard tuning, A4 = 440 Hz. */
  hz: number;
}

const fromMidi = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Strings in on-screen order, top → bottom (same as the fretboard). */
export const TUNE_TARGETS: readonly TuneTarget[] = [
  { row: 0, number: 1, note: "G", hz: fromMidi(43) }, // G2 ≈ 98.00 Hz
  { row: 1, number: 2, note: "D", hz: fromMidi(38) }, // D2 ≈ 73.42 Hz
  { row: 2, number: 3, note: "A", hz: fromMidi(33) }, // A1 = 55.00 Hz
  { row: 3, number: 4, note: "E", hz: fromMidi(28) }, // E1 ≈ 41.20 Hz
];

/** |cents| inside this counts as in tune. */
export const IN_TUNE_CENTS = 5;
/** |cents| inside this is "close" (amber) rather than far off (rose). */
export const NEAR_CENTS = 25;
/** Needle full scale, cents either side of centre. */
export const METER_CENTS = 50;
/** How long the reading must stay in tune for the string to pass. */
export const HOLD_MS = 700;
/** Auto mode listens across all four strings (and a bit beyond). */
export const AUTO_BAND: readonly [number, number] = [32, 125];
/** A locked string is searched ±7 semitones — under an octave, so octave mix-ups cannot happen. */
const LOCKED_SPAN = Math.pow(2, 7 / 12);

export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

export function searchBand(lockedRow: number | null): readonly [number, number] {
  if (lockedRow === null) return AUTO_BAND;
  const hz = TUNE_TARGETS[lockedRow].hz;
  return [hz / LOCKED_SPAN, hz * LOCKED_SPAN];
}

/** The string whose target is closest (in cents) to `freq`. */
export function nearestRow(freq: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (const t of TUNE_TARGETS) {
    const a = Math.abs(centsBetween(freq, t.hz));
    if (a < bestAbs) {
      bestAbs = a;
      best = t.row;
    }
  }
  return best;
}

export type Zone = "in" | "near" | "far";

export function zoneOf(cents: number): Zone {
  const a = Math.abs(cents);
  if (a <= IN_TUNE_CENTS) return "in";
  return a <= NEAR_CENTS ? "near" : "far";
}

export type Advice = "listen" | "ok" | "up" | "down";

export function adviceOf(cents: number | null): Advice {
  if (cents === null) return "listen";
  if (Math.abs(cents) <= IN_TUNE_CENTS) return "ok";
  return cents < 0 ? "up" : "down";
}

/** Plain-language size of an offset, e.g. "조금 낮아요 · 12센트" or "많이 높아요 · 약 1.5반음". */
export function offsetText(cents: number): string {
  const a = Math.abs(cents);
  const dir = cents < 0 ? "낮아요" : "높아요";
  if (a >= 100) return `많이 ${dir} · 약 ${(a / 100).toFixed(1)}반음`;
  const n = Math.round(a);
  if (a > METER_CENTS) return `많이 ${dir} · ${n}센트`;
  if (a > NEAR_CENTS) return `${dir} · ${n}센트`;
  return `조금 ${dir} · ${n}센트`;
}

export interface TunerView {
  /** String being judged — the locked one, or the auto-detected one. */
  row: number | null;
  /** Smoothed offset from that string's target, cents (null = nothing heard lately). */
  cents: number | null;
  /** Smoothed frequency, Hz. */
  freq: number | null;
  /** A fresh reading arrived within the last few frames (the note is ringing). */
  live: boolean;
  /** 0 … 1 progress of the hold-to-pass timer. */
  hold: number;
  /** Rows that have passed this session, top → bottom. */
  passed: readonly number[];
  /** Row that passed on this very update (one-shot feedback). */
  justPassed: number | null;
}

export const EMPTY_VIEW: TunerView = {
  row: null,
  cents: null,
  freq: null,
  live: false,
  hold: 0,
  passed: [],
  justPassed: null,
};

const MEDIAN_SIZE = 5;
/** Auto mode needs this many consecutive readings of another string before switching. */
const SWITCH_FRAMES = 3;
/** A reading is "live" when the last one is at most this old. */
const LIVE_MS = 260;
/** Keep showing the last reading this long after the note dies away. */
const SHOW_MS = 1200;
/** Brief wobbles out of the zone shorter than this don't reset the hold. */
const ZONE_GRACE_MS = 180;
/** Needle smoothing (exponential, per reading). */
const SMOOTHING = 0.45;

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class TunerTracker {
  private locked: number | null = null;
  private row: number | null = null;
  private candidate: number | null = null;
  private candidateCount = 0;
  private recent: number[] = [];
  private display: number | null = null;
  private lastHeard = -Infinity;
  private zoneStart: number | null = null;
  private lastInZone = -Infinity;
  private passedRows = new Set<number>();
  private lastView: TunerView = EMPTY_VIEW;

  /** Judge only this string (null = auto-detect the nearest string). */
  setLocked(row: number | null): void {
    this.locked = row;
    this.row = row;
    this.clearReading();
  }

  /** Forget the current reading (passes are kept). */
  clearReading(): void {
    this.candidate = null;
    this.candidateCount = 0;
    this.recent = [];
    this.display = null;
    this.lastHeard = -Infinity;
    this.zoneStart = null;
    this.lastInZone = -Infinity;
    if (this.locked === null) this.row = null;
    this.lastView = this.view(0, null);
  }

  resetPassed(): void {
    this.passedRows.clear();
    this.lastView = { ...this.lastView, passed: [], justPassed: null };
  }

  /** The most recent view, without consuming a reading. */
  snapshot(): TunerView {
    return { ...this.lastView, justPassed: null };
  }

  /** Feed one detector reading (`freq` null = nothing usable heard) taken at time `t` (ms). */
  update(freq: number | null, t: number): TunerView {
    if (freq !== null && Number.isFinite(freq) && freq > 0) {
      const heardRow = this.locked ?? nearestRow(freq);
      if (this.row === null) {
        this.switchTo(heardRow);
      } else if (heardRow !== this.row) {
        if (this.candidate === heardRow) this.candidateCount++;
        else {
          this.candidate = heardRow;
          this.candidateCount = 1;
        }
        if (this.candidateCount >= SWITCH_FRAMES) this.switchTo(heardRow);
      } else {
        this.candidate = null;
        this.candidateCount = 0;
      }

      if (this.row === heardRow) {
        const cents = centsBetween(freq, TUNE_TARGETS[this.row].hz);
        this.recent.push(cents);
        if (this.recent.length > MEDIAN_SIZE) this.recent.shift();
        const steady = median(this.recent);
        this.display = this.display === null ? steady : this.display + SMOOTHING * (steady - this.display);
        this.lastHeard = t;
      }
    }

    const live = t - this.lastHeard <= LIVE_MS;
    if (t - this.lastHeard > SHOW_MS) {
      this.display = null;
      this.recent = [];
    }

    let justPassed: number | null = null;
    const inZone = live && this.display !== null && Math.abs(this.display) <= IN_TUNE_CENTS;
    if (inZone) {
      if (this.zoneStart === null) this.zoneStart = t;
      this.lastInZone = t;
    } else if (this.zoneStart !== null && t - this.lastInZone > ZONE_GRACE_MS) {
      this.zoneStart = null;
    }
    let hold = 0;
    if (this.zoneStart !== null && this.row !== null) {
      hold = Math.min(1, (t - this.zoneStart) / HOLD_MS);
      if (hold >= 1 && !this.passedRows.has(this.row)) {
        this.passedRows.add(this.row);
        justPassed = this.row;
      }
    }

    this.lastView = this.view(hold, justPassed, live);
    return this.lastView;
  }

  private switchTo(row: number): void {
    this.row = row;
    this.candidate = null;
    this.candidateCount = 0;
    this.recent = [];
    this.display = null;
    this.zoneStart = null;
  }

  private view(hold: number, justPassed: number | null, live = false): TunerView {
    const target = this.row === null ? null : TUNE_TARGETS[this.row];
    return {
      row: this.row,
      cents: this.display,
      freq: target && this.display !== null ? target.hz * Math.pow(2, this.display / 1200) : null,
      live: live && this.display !== null,
      hold,
      passed: [...this.passedRows].sort((a, b) => a - b),
      justPassed,
    };
  }
}
