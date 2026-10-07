import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Settings2, Smartphone, Square } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Fretboard, type CellMarkKind } from "@/components/fretboard";
import { Pill } from "@/components/pill";
import { TrainerTabs } from "@/components/trainer-tabs";
import { useTrainerChrome } from "@/hooks/use-trainer-chrome";
import { pluck, unlockAudio } from "@/lib/bass-audio";
import { STRINGS, cellKey, frequencyAt, positionLabel, type NoteName } from "@/lib/fretboard";
import {
  COUNTS,
  DRILL_TAPS,
  GRADE_SYMBOL,
  HOME_POSITION,
  NOTE_SETS,
  NOTE_SET_ORDER,
  NOTE_SET_TEXT,
  RANGES,
  TIME_LIMIT_MS,
  buildQueue,
  formatSeconds,
  grade as gradeOf,
  isPitch,
  requeue,
  samePosition,
  statsByNote,
  weakNotes,
  type Attempt,
  type Grade,
  type NoteStats,
  type QuizSettings,
} from "@/lib/quiz";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Phase = "idle" | "question" | "feedback" | "drill" | "done";

interface Feedback {
  grade: Grade;
  note: NoteName;
  ms: number;
  row: number;
  fret: number;
}

const FEEDBACK_MS = 1100;
const DRILL_DONE_MS = 700;

const GRADE_TEXT: Record<Grade, string> = {
  best: "text-emerald-300",
  ok: "text-amber-300",
  miss: "text-rose-300",
};

function homeOf(note: NoteName) {
  return HOME_POSITION[note];
}

function next<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

export function QuizPage() {
  const { portrait } = useTrainerChrome();
  const { mirrored, setMirrored, octaveUp, settings, setSettings, lastQuiz, setLastQuiz } = useAppStore(
    useShallow((s) => ({
      mirrored: s.mirrored,
      setMirrored: s.setMirrored,
      octaveUp: s.octaveUp,
      settings: s.quizSettings,
      setSettings: s.setQuizSettings,
      lastQuiz: s.lastQuiz,
      setLastQuiz: s.setLastQuiz,
    })),
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [queue, setQueue] = useState<NoteName[]>([]);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [drillTaps, setDrillTaps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [marks, setMarks] = useState<Record<string, CellMarkKind>>({});
  /** Settings the running session started with (the store may change meanwhile). */
  const [active, setActive] = useState<QuizSettings>(settings);

  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const target = phase === "idle" || phase === "done" ? null : (queue[index] ?? null);
  const notes = NOTE_SETS[active.set];
  const doneStats = useMemo<NoteStats[]>(
    () => (phase === "done" ? statsByNote(attempts, notes) : []),
    [phase, attempts, notes],
  );

  const clearTimers = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // Running clock while a question is open.
  useEffect(() => {
    if (phase !== "question") return;
    const tick = () => {
      setElapsed(performance.now() - startedAt.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [phase, index]);

  const mapMarks = useMemo(() => {
    const m: Record<string, CellMarkKind> = {};
    for (const n of NOTE_SETS[settings.set]) {
      const p = homeOf(n);
      if (p) m[cellKey(p.row, p.fret)] = "map";
    }
    return m;
  }, [settings.set]);

  const openQuestion = useCallback((q: NoteName[], i: number) => {
    setQueue(q);
    setIndex(i);
    setMarks({});
    setFeedback(null);
    setDrillTaps(0);
    setElapsed(0);
    startedAt.current = performance.now();
    setPhase("question");
  }, []);

  const finish = useCallback(
    (all: Attempt[], s: QuizSettings) => {
      clearTimers();
      const stats = statsByNote(all, NOTE_SETS[s.set]);
      const m: Record<string, CellMarkKind> = {};
      for (const st of stats) {
        const p = homeOf(st.note);
        if (!p) continue;
        m[cellKey(p.row, p.fret)] = st.miss > 0 ? "miss" : st.ok > 0 ? "ok" : "best";
      }
      setMarks(m);
      setFeedback(null);
      setPhase("done");
      setLastQuiz({ finishedAt: Date.now(), settings: s, attempts: all });
    },
    [clearTimers, setLastQuiz],
  );

  const advance = useCallback(
    (q: NoteName[], i: number, all: Attempt[], s: QuizSettings) => {
      if (i + 1 >= q.length) finish(all, s);
      else openQuestion(q, i + 1);
    },
    [finish, openQuestion],
  );

  const start = useCallback(
    (customQueue?: NoteName[]) => {
      clearTimers();
      const s = settings;
      setActive(s);
      setAttempts([]);
      const q = customQueue ?? buildQueue(NOTE_SETS[s.set], s.count);
      openQuestion(q, 0);
    },
    [clearTimers, openQuestion, settings],
  );

  const stop = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setFeedback(null);
    setMarks({});
  }, [clearTimers]);

  const retryWeak = useCallback(() => {
    const weak = weakNotes(doneStats);
    if (weak.length === 0) return;
    start(buildQueue(weak, Math.max(6, weak.length * 2)));
  }, [doneStats, start]);

  const handlePlay = useCallback(
    (row: number, fret: number) => {
      try {
        pluck(frequencyAt(STRINGS[row].openHz, fret, octaveUp));
      } catch {
        // Web Audio unavailable — the visual quiz still works.
      }
      if (!target) return;
      const key = cellKey(row, fret);

      if (phase === "question") {
        const ms = performance.now() - startedAt.current;
        const correct = isPitch(row, fret, target);
        const g = gradeOf(correct, ms);
        const attempt: Attempt = { note: target, grade: g, ms, row, fret };
        const all = [...attempts, attempt];
        setAttempts(all);
        setFeedback({ grade: g, note: target, ms, row, fret });
        const home = homeOf(target);
        if (correct) {
          const m: Record<string, CellMarkKind> = { [key]: "correct" };
          if (home && !samePosition(home, { row, fret })) m[cellKey(home.row, home.fret)] = "map";
          setMarks(m);
          setPhase("feedback");
          timer.current = window.setTimeout(() => advance(queue, index, all, active), FEEDBACK_MS);
        } else {
          const m: Record<string, CellMarkKind> = { [key]: "wrong" };
          if (home) m[cellKey(home.row, home.fret)] = "target";
          setMarks(m);
          setDrillTaps(0);
          setQueue(requeue(queue, index, target));
          setPhase("drill");
        }
        return;
      }

      if (phase === "drill") {
        const home = homeOf(target);
        if (!home || !samePosition(home, { row, fret })) return;
        const taps = drillTaps + 1;
        setDrillTaps(taps);
        setMarks({ [key]: taps >= DRILL_TAPS ? "correct" : "target" });
        if (taps >= DRILL_TAPS) {
          timer.current = window.setTimeout(() => advance(queue, index, attempts, active), DRILL_DONE_MS);
        }
      }
    },
    [octaveUp, target, phase, attempts, queue, index, active, advance, drillTaps],
  );

  const running = phase === "question" || phase === "feedback" || phase === "drill";
  const tally = useMemo(
    () => ({
      best: attempts.filter((a) => a.grade === "best").length,
      ok: attempts.filter((a) => a.grade === "ok").length,
      miss: attempts.filter((a) => a.grade === "miss").length,
    }),
    [attempts],
  );
  const overLimit = phase === "question" && elapsed > TIME_LIMIT_MS;
  const boardFrets = running || phase === "done" ? active.range : settings.range;

  return (
    <div
      className="bft-root fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground select-none"
      onPointerDownCapture={unlockAudio}
      onPointerUpCapture={unlockAudio}
      onTouchEndCapture={unlockAudio}
      onKeyDownCapture={unlockAudio}
    >
      <h1 className="sr-only">음이름 퀴즈</h1>

      <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <TrainerTabs />

        {/* Question / feedback — one live region; the clock stays out of it. */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <div className="flex min-w-0 items-baseline gap-2 truncate" role="status" aria-live="polite" aria-atomic="true">
            {phase === "idle" && (
              <span className="truncate text-xs text-muted-foreground">
                {lastQuiz
                  ? `지난 결과 ◎${lastQuiz.attempts.filter((a) => a.grade === "best").length} ○${
                      lastQuiz.attempts.filter((a) => a.grade === "ok").length
                    } X${lastQuiz.attempts.filter((a) => a.grade === "miss").length}`
                  : "시작을 누르면 첫 문제가 나옵니다"}
              </span>
            )}
            {phase === "question" && target && (
              <>
                <span className="text-3xl leading-none font-extrabold text-foreground">{target}</span>
                <span className="text-xs font-medium text-muted-foreground">지판에서 찾아 누르세요</span>
              </>
            )}
            {phase === "feedback" && feedback && (
              <>
                <span className={cn("text-3xl leading-none font-extrabold", GRADE_TEXT[feedback.grade])}>
                  {GRADE_SYMBOL[feedback.grade]}
                </span>
                <span className="text-sm font-semibold">
                  {feedback.note} · {positionLabel(STRINGS[feedback.row], feedback.fret)}
                </span>
                <span className={cn("text-xs font-medium", GRADE_TEXT[feedback.grade])}>
                  {formatSeconds(feedback.ms)}
                  {feedback.grade === "ok" && " · 3초 초과"}
                </span>
              </>
            )}
            {phase === "drill" && feedback && (
              <>
                <span className="text-3xl leading-none font-extrabold text-rose-300">X</span>
                <span className="text-sm font-semibold">
                  {feedback.note}은(는) {positionLabel(STRINGS[homeOf(feedback.note).row], homeOf(feedback.note).fret)}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  표시된 자리를 {DRILL_TAPS}번 누르세요 · {drillTaps}/{DRILL_TAPS}
                </span>
              </>
            )}
            {phase === "done" && (
              <span className="text-sm font-semibold">
                <span className="text-emerald-300">◎ {tally.best}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="text-amber-300">○ {tally.ok}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="text-rose-300">X {tally.miss}</span>
              </span>
            )}
          </div>

          {running && (
            <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums" aria-hidden="true">
              <span className="font-semibold text-muted-foreground">
                {Math.min(index + 1, queue.length)}/{queue.length}
              </span>
              {active.timer && phase === "question" && (
                <span
                  className={cn(
                    "min-w-[3.5rem] rounded-full px-2 py-0.5 text-center font-bold",
                    overLimit ? "bg-amber-400/20 text-amber-300" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {formatSeconds(elapsed)}
                </span>
              )}
              <span className="text-muted-foreground">
                ◎{tally.best} ○{tally.ok} X{tally.miss}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Pill pressed={mirrored} onClick={() => setMirrored(!mirrored)}>
            좌우 반전
          </Pill>
          {running && (
            <Pill onClick={stop} className="gap-1.5">
              <Square className="size-3.5" aria-hidden="true" />
              중지
            </Pill>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <Fretboard
          id="bft-content"
          mirrored={mirrored}
          labelMode="hidden"
          frets={boardFrets}
          marks={phase === "idle" ? mapMarks : marks}
          onPlay={handlePlay}
          className="h-full"
        />

        {phase === "idle" && (
          <section
            aria-labelledby="quiz-setup-title"
            className="absolute inset-x-0 top-1/2 mx-auto w-[min(92vw,34rem)] -translate-y-1/2 rounded-3xl bg-card/95 p-4 shadow-2xl ring-1 ring-border backdrop-blur"
          >
            <h2 id="quiz-setup-title" className="font-heading text-base font-bold">
              음이름 퀴즈
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              뜨는 음을 지판에서 {TIME_LIMIT_MS / 1000}초 안에 찾아 누르세요. 틀리면 정답 자리를 {DRILL_TAPS}번 누른 뒤
              잠시 후 다시 나옵니다. 지판의 표시는 이번 주 대표 위치예요.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="퀴즈 설정">
              <Pill onClick={() => setSettings({ range: next(RANGES, settings.range) })}>
                범위 · 0–{settings.range}프렛
              </Pill>
              <Pill onClick={() => setSettings({ set: next(NOTE_SET_ORDER, settings.set) })}>
                음 · {NOTE_SET_TEXT[settings.set]}
              </Pill>
              <Pill onClick={() => setSettings({ count: next(COUNTS, settings.count) })}>
                문제 · {settings.count}개
              </Pill>
              <Pill pressed={settings.timer} onClick={() => setSettings({ timer: !settings.timer })}>
                타이머
              </Pill>
            </div>
            <button
              type="button"
              onClick={() => start()}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Play className="size-4" aria-hidden="true" />
              시작
            </button>
          </section>
        )}

        {phase === "done" && (
          <section
            aria-labelledby="quiz-result-title"
            className="absolute inset-x-0 top-1/2 mx-auto flex max-h-[calc(100%-1rem)] w-[min(94vw,40rem)] -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-3xl bg-card/95 p-4 shadow-2xl ring-1 ring-border backdrop-blur sm:flex-row"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h2 id="quiz-result-title" className="font-heading text-base font-bold">
                결과
              </h2>
              <ResultSummary attempts={attempts} stats={doneStats} settings={active} />
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <Pill onClick={() => start()} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  다시 시작
                </Pill>
                {weakNotes(doneStats).length > 0 && <Pill onClick={retryWeak}>틀린 음만 다시</Pill>}
                <Pill onClick={stop} className="gap-1.5">
                  <Settings2 className="size-3.5" aria-hidden="true" />
                  설정
                </Pill>
              </div>
            </div>
            <ResultTable stats={doneStats} />
          </section>
        )}

        {portrait && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
          >
            <div className="flex items-center gap-3 rounded-full bg-card px-5 py-3 text-sm font-semibold shadow-lg ring-1 ring-border">
              <Smartphone className="size-5 rotate-90 text-primary" aria-hidden="true" />
              휴대폰을 가로로 돌려주세요
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ResultSummaryProps {
  attempts: Attempt[];
  stats: NoteStats[];
  settings: QuizSettings;
}

function ResultSummary({ attempts, stats, settings }: ResultSummaryProps) {
  const best = attempts.filter((a) => a.grade === "best").length;
  const avg = attempts.length ? attempts.reduce((s, a) => s + a.ms, 0) / attempts.length : 0;
  const weak = weakNotes(stats);
  const goal = settings.count === 10 ? 5 : Math.ceil(settings.count / 2);
  return (
    <div className="space-y-1.5 text-sm">
      <p>
        {attempts.length}문제 · 평균 {formatSeconds(avg)}
      </p>
      <p className={cn("font-semibold", best >= goal ? "text-emerald-300" : "text-amber-300")}>
        ◎ {best}개 — 목표 {goal}개 이상 {best >= goal ? "달성" : "미달"}
      </p>
      <p className="text-muted-foreground">
        {weak.length > 0 ? (
          <>
            다음엔 <span className="font-semibold text-foreground">{weak.join(" · ")}</span>
            {weak.length === 1 ? "을(를)" : "을"} 더 연습하세요.
          </>
        ) : (
          "모든 음을 3초 안에 찾았어요."
        )}
      </p>
    </div>
  );
}

function ResultTable({ stats }: { stats: NoteStats[] }) {
  return (
    <table className="shrink-0 self-start text-xs tabular-nums sm:min-w-[14rem]">
      <caption className="sr-only">음별 결과</caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th scope="col" className="pr-3 pb-1 font-medium">
            음
          </th>
          <th scope="col" className="pr-3 pb-1 font-medium">
            결과
          </th>
          <th scope="col" className="pb-1 text-right font-medium">
            평균
          </th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.note} className="border-t border-border/60">
            <th scope="row" className="py-1 pr-3 text-left text-sm font-extrabold">
              {s.note}
            </th>
            <td className="py-1 pr-3 font-bold tracking-wider">
              {s.attempts.map((a, i) => (
                <span key={i} className={GRADE_TEXT[a.grade]}>
                  {GRADE_SYMBOL[a.grade]}
                </span>
              ))}
            </td>
            <td className={cn("py-1 text-right", s.avgMs !== null && s.avgMs > TIME_LIMIT_MS && "text-amber-300")}>
              {s.avgMs === null ? "–" : formatSeconds(s.avgMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
