import { CHROMATIC, STRINGS, noteAt, type NoteName } from "./fretboard";

export type NoteSet = "all7" | "efg" | "abc";
export type FretRange = 5 | 12;
export type QuestionCount = 7 | 10 | 20;

export interface QuizSettings {
  /** Highest fret shown and asked. */
  range: FretRange;
  set: NoteSet;
  count: QuestionCount;
  /** Show the running clock during a question (grading always uses it). */
  timer: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { range: 5, set: "all7", count: 10, timer: true };

export const RANGES: readonly FretRange[] = [5, 12];
export const COUNTS: readonly QuestionCount[] = [7, 10, 20];
export const NOTE_SET_ORDER: readonly NoteSet[] = ["all7", "efg", "abc"];

export const NOTE_SETS: Record<NoteSet, readonly NoteName[]> = {
  all7: ["C", "D", "E", "F", "G", "A", "B"],
  efg: ["E", "F", "G"],
  abc: ["A", "B", "C"],
};

export const NOTE_SET_TEXT: Record<NoteSet, string> = {
  all7: "7음 전체",
  efg: "E·F·G",
  abc: "A·B·C",
};

export interface Position {
  /** Row index into STRINGS (0 = 1번줄 G … 3 = 4번줄 E). */
  row: number;
  fret: number;
}

/**
 * This week's representative position for each natural note — one place per
 * note, all inside frets 0–5 (E·F·G on the 4th string, A·B·C on the 3rd,
 * D open on the 2nd).
 */
export const HOME_POSITION: Readonly<Record<string, Position>> = {
  E: { row: 3, fret: 0 },
  F: { row: 3, fret: 1 },
  G: { row: 3, fret: 3 },
  A: { row: 2, fret: 0 },
  B: { row: 2, fret: 2 },
  C: { row: 2, fret: 3 },
  D: { row: 1, fret: 0 },
};

/** A correct answer inside this time earns ◎; slower correct answers earn ○. */
export const TIME_LIMIT_MS = 3000;
/** After a miss the right spot is tapped this many times before moving on. */
export const DRILL_TAPS = 3;

export type Grade = "best" | "ok" | "miss";
export const GRADE_SYMBOL: Record<Grade, string> = { best: "◎", ok: "○", miss: "X" };

export interface Attempt {
  note: NoteName;
  grade: Grade;
  ms: number;
  /** Where the first tap landed. */
  row: number;
  fret: number;
}

export interface QuizSummary {
  finishedAt: number;
  settings: QuizSettings;
  attempts: Attempt[];
}

export function isPitch(row: number, fret: number, note: NoteName): boolean {
  return noteAt(STRINGS[row].open, fret) === note;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.fret === b.fret;
}

export function grade(correct: boolean, ms: number): Grade {
  if (!correct) return "miss";
  return ms <= TIME_LIMIT_MS ? "best" : "ok";
}

/**
 * Question order: every note of the set at least once when the count allows,
 * shuffled, with back-to-back repeats broken up where possible.
 */
export function buildQueue(notes: readonly NoteName[], count: number, rng: () => number = Math.random): NoteName[] {
  if (notes.length === 0 || count <= 0) return [];
  const pool: NoteName[] = [];
  while (pool.length < count) {
    for (const n of notes) {
      if (pool.length < count) pool.push(n);
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Break up back-to-back repeats by swapping with a later note that creates
  // no new repeat on either side; a few passes settle it (a tiny set with a
  // long count may keep an unavoidable repeat).
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 1; i < pool.length; i++) {
      if (pool[i] !== pool[i - 1]) continue;
      const v = pool[i];
      for (let j = 0; j < pool.length; j++) {
        if (j === i || j === i - 1) continue;
        const candidate = pool[j];
        if (candidate === pool[i - 1]) continue;
        if (i + 1 < pool.length && i + 1 !== j && candidate === pool[i + 1]) continue;
        if (j - 1 >= 0 && j - 1 !== i && pool[j - 1] === v) continue;
        if (j + 1 < pool.length && j + 1 !== i && pool[j + 1] === v) continue;
        [pool[i], pool[j]] = [pool[j], pool[i]];
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return pool;
}

/** Re-ask a missed note a couple of questions later. */
export function requeue(queue: readonly NoteName[], currentIndex: number, note: NoteName): NoteName[] {
  const next = queue.slice();
  const at = Math.min(next.length, currentIndex + 3);
  next.splice(at, 0, note);
  return next;
}

export interface NoteStats {
  note: NoteName;
  attempts: Attempt[];
  avgMs: number | null;
  best: number;
  ok: number;
  miss: number;
}

export function statsByNote(attempts: readonly Attempt[], notes: readonly NoteName[]): NoteStats[] {
  const order = notes.length > 0 ? notes : CHROMATIC;
  return order
    .map((note) => {
      const own = attempts.filter((a) => a.note === note);
      const total = own.reduce((sum, a) => sum + a.ms, 0);
      return {
        note,
        attempts: own,
        avgMs: own.length ? total / own.length : null,
        best: own.filter((a) => a.grade === "best").length,
        ok: own.filter((a) => a.grade === "ok").length,
        miss: own.filter((a) => a.grade === "miss").length,
      };
    })
    .filter((s) => s.attempts.length > 0);
}

/** Notes that were missed or answered slowly on average — next session's focus. */
export function weakNotes(stats: readonly NoteStats[]): NoteName[] {
  return stats
    .filter((s) => s.miss > 0 || (s.avgMs !== null && s.avgMs > TIME_LIMIT_MS))
    .map((s) => s.note);
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}초`;
}
