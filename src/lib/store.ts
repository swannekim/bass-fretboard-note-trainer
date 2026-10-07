import { create } from "zustand";
import { DEFAULT_SETTINGS, type QuizSettings, type QuizSummary } from "./quiz";

// Global client state shared across the trainer pages. ONE module-scoped
// store, no Provider needed. Read with narrow selectors
// (`useAppStore((s) => s.mirrored)`), never `useAppStore()` with no selector.

interface AppState {
  /** Nut on the right (photo / audience view) — shared by every page. */
  mirrored: boolean;
  setMirrored: (mirrored: boolean) => void;
  /** Play everything one octave up (small phone speakers). */
  octaveUp: boolean;
  setOctaveUp: (octaveUp: boolean) => void;
  quizSettings: QuizSettings;
  setQuizSettings: (patch: Partial<QuizSettings>) => void;
  /** Most recent finished quiz, kept while the app stays open. */
  lastQuiz: QuizSummary | null;
  setLastQuiz: (summary: QuizSummary) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mirrored: false,
  setMirrored: (mirrored) => set({ mirrored }),
  octaveUp: false,
  setOctaveUp: (octaveUp) => set({ octaveUp }),
  quizSettings: DEFAULT_SETTINGS,
  setQuizSettings: (patch) => set((s) => ({ quizSettings: { ...s.quizSettings, ...patch } })),
  lastQuiz: null,
  setLastQuiz: (lastQuiz) => set({ lastQuiz }),
}));
