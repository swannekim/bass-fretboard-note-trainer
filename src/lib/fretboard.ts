/**
 * Bass fretboard model — standard 4-string tuning, drawn from the player's
 * point of view (looking down at the neck): 1st string G at the TOP, 4th
 * string E at the BOTTOM, nut on the LEFT unless mirrored.
 */

export const STRING_COUNT = 4;
export const FRET_COUNT = 12;

export type LabelTone = "red" | "blue";

export interface BassString {
  /** 1번줄 … 4번줄 */
  number: 1 | 2 | 3 | 4;
  /** Note name of the open string. */
  open: NoteName;
  /** Standard tuning, Hz. */
  openHz: number;
  /** Letter colour family from the reference chart: E/A red, D/G blue. */
  tone: LabelTone;
  /** Relative string thickness (px at the reference row height). */
  gauge: number;
}

export const CHROMATIC = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;
export type NoteName = (typeof CHROMATIC)[number];

/** Strings in on-screen order, top → bottom. */
export const STRINGS: readonly BassString[] = [
  { number: 1, open: "G", openHz: 98.0, tone: "blue", gauge: 2.2 },
  { number: 2, open: "D", openHz: 73.42, tone: "blue", gauge: 3.2 },
  { number: 3, open: "A", openHz: 55.0, tone: "red", gauge: 4.4 },
  { number: 4, open: "E", openHz: 41.2, tone: "red", gauge: 5.6 },
];

export function noteAt(open: NoteName, fret: number): NoteName {
  const start = CHROMATIC.indexOf(open);
  return CHROMATIC[(start + fret) % CHROMATIC.length];
}

export function isNatural(note: NoteName): boolean {
  return !note.includes("♯");
}

/** Flat spelling of each sharp — the same pitch, written the other way. */
const FLAT_OF: Readonly<Partial<Record<NoteName, string>>> = {
  "C♯": "D♭",
  "D♯": "E♭",
  "F♯": "G♭",
  "G♯": "A♭",
  "A♯": "B♭",
};

/** "D♭" for "C♯"; null for a natural. */
export function flatOf(note: NoteName): string | null {
  return FLAT_OF[note] ?? null;
}

/** Both spellings for an accidental ("C♯ / D♭"), the bare letter for a natural. */
export function displayName(note: NoteName): string {
  const flat = flatOf(note);
  return flat ? `${note} / ${flat}` : note;
}

/** Fret n sounds `open × 2^(n/12)`; the octave switch doubles everything. */
export function frequencyAt(openHz: number, fret: number, octaveUp: boolean): number {
  return openHz * Math.pow(2, fret / 12) * (octaveUp ? 2 : 1);
}

export function cellKey(row: number, fret: number): string {
  return `${row}:${fret}`;
}

export function positionLabel(s: BassString, fret: number): string {
  return fret === 0 ? `${s.number}번줄 개방` : `${s.number}번줄 ${fret}프렛`;
}

/** Fret-marker inlays: single dots at 3/5/7/9, a double dot at 12. */
export const SINGLE_DOT_FRETS = [3, 5, 7, 9] as const;
export const DOUBLE_DOT_FRET = 12;

// ── Layout ────────────────────────────────────────────────────────────────

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  mirrored: boolean;
  /** Width of the open-string (headstock-side) column. */
  openW: number;
  /** Width of the nut. */
  nutW: number;
  /**
   * x of each fret wire in un-mirrored coordinates. `wires[0]` is the
   * fret-side edge of the nut; `wires[k]` is fret wire k (k = 1 … FRET_COUNT).
   */
  wires: number[];
  rowH: number;
  /** Number of frets drawn (wires.length - 1). */
  frets: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Column geometry for a board of the given pixel size. Fret cells are
 * uniform on narrow phones (every cell stays a ≥44px target) and gain a
 * gentle real-neck taper only when there is room to spare.
 */
export function computeLayout(
  width: number,
  height: number,
  mirrored: boolean,
  frets: number = FRET_COUNT,
): BoardLayout {
  const n = Math.max(1, Math.floor(frets));
  const openW = clamp(width * 0.085, 48, 80);
  const nutW = clamp(width * 0.012, 6, 12);
  const endPad = clamp(width * 0.01, 4, 10);
  const avail = Math.max(0, width - openW - nutW - endPad);
  const uniform = avail / n;
  const taper = clamp((uniform - 50) / 26, 0, 1);
  const weights = Array.from(
    { length: n },
    (_, i) => 1 + taper * (0.22 - (0.44 * i) / Math.max(1, n - 1)),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const wires = [openW + nutW];
  for (let i = 0; i < n; i++) {
    wires.push(wires[i] + (avail * weights[i]) / total);
  }
  return { width, height, mirrored, openW, nutW, wires, rowH: height / STRING_COUNT, frets: n };
}

/** Map an un-mirrored x to screen x. */
export function screenX(l: BoardLayout, x: number): number {
  return l.mirrored ? l.width - x : x;
}

/** Screen-space rectangle of one cell (fret 0 = open string + nut). */
export function cellRect(l: BoardLayout, row: number, fret: number): CellRect {
  let x0: number;
  let x1: number;
  if (fret === 0) {
    x0 = 0;
    x1 = l.openW + l.nutW;
  } else {
    x0 = l.wires[fret - 1];
    x1 = l.wires[fret];
  }
  if (l.mirrored) {
    const a = l.width - x1;
    const b = l.width - x0;
    x0 = a;
    x1 = b;
  }
  return { x: x0, y: row * l.rowH, w: x1 - x0, h: l.rowH };
}

export interface CellHit {
  row: number;
  fret: number;
}

/** Which cell a board-local point falls in; null when outside the board. */
export function hitTest(l: BoardLayout, x: number, y: number): CellHit | null {
  if (x < 0 || y < 0 || x > l.width || y > l.height) return null;
  const row = clamp(Math.floor(y / l.rowH), 0, STRING_COUNT - 1);
  const ux = l.mirrored ? l.width - x : x;
  if (ux < l.wires[0]) return { row, fret: 0 };
  for (let k = 1; k <= l.frets; k++) {
    if (ux < l.wires[k]) return { row, fret: k };
  }
  return { row, fret: l.frets };
}
