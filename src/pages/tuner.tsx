import { useCallback, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Smartphone,
  Volume2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Pill } from "@/components/pill";
import { TrainerTabs } from "@/components/trainer-tabs";
import { useMicTuner, type MicStatus } from "@/hooks/use-mic-tuner";
import { useTrainerChrome } from "@/hooks/use-trainer-chrome";
import { isPreviewMount } from "@/lib/app-view-serializer";
import { pluck, unlockAudio } from "@/lib/bass-audio";
import { STRINGS } from "@/lib/fretboard";
import { useAppStore } from "@/lib/store";
import {
  METER_CENTS,
  NEAR_CENTS,
  IN_TUNE_CENTS,
  TUNE_TARGETS,
  adviceOf,
  offsetText,
  zoneOf,
  type TuneTarget,
  type TunerView,
  type Zone,
} from "@/lib/tuner";
import { cn } from "@/lib/utils";

/** The phone's own reference tone must not be judged as the bass. */
const REFERENCE_MUTE_MS = 2300;

const ZONE_TEXT: Record<Zone, string> = {
  in: "text-emerald-300",
  near: "text-amber-300",
  far: "text-rose-300",
};
const ZONE_COLOR: Record<Zone, string> = { in: "#34d399", near: "#fbbf24", far: "#fb7185" };
const ZONE_FILL: Record<Zone, string> = {
  in: "rgba(52, 211, 153, 0.55)",
  near: "rgba(251, 191, 36, 0.26)",
  far: "rgba(251, 113, 133, 0.22)",
};
const TONE_TEXT = { red: "text-[#ff7a7a]", blue: "text-[#6cb8ff]" } as const;
const STRING_METAL = "linear-gradient(#f4f4f6, #c9c9ce 55%, #8e8e94)";
const PREVIEW_TEXT = "미리보기 화면에서는 마이크를 쓸 수 없어요. 게시된 앱 링크에서 열면 동작해요.";

export function TunerPage() {
  const { portrait } = useTrainerChrome();
  const { octaveUp, setOctaveUp } = useAppStore(
    useShallow((s) => ({ octaveUp: s.octaveUp, setOctaveUp: s.setOctaveUp })),
  );
  const [locked, setLockedRow] = useState<number | null>(null);
  const onPass = useCallback(() => {
    try {
      navigator.vibrate?.(60);
    } catch {
      // no haptics on this device
    }
  }, []);
  const tuner = useMicTuner(onPass);
  const { status, view, promptSlow } = tuner;
  const listening = status === "listening";
  const inPreview = isPreviewMount(import.meta.env.BASE_URL ?? "./");
  const lockedTarget = locked === null ? null : TUNE_TARGETS[locked];
  const allPassed = view.passed.length === TUNE_TARGETS.length;

  const toggleLock = (row: number) => {
    const next = locked === row ? null : row;
    setLockedRow(next);
    tuner.setLocked(next);
  };

  const playReference = (row: number) => {
    unlockAudio();
    tuner.muteFor(REFERENCE_MUTE_MS);
    try {
      pluck(TUNE_TARGETS[row].hz * (octaveUp ? 2 : 1));
    } catch {
      // Web Audio unavailable — nothing to play.
    }
  };

  const wakeAudio = () => {
    unlockAudio();
    tuner.resume();
  };

  return (
    <div
      className="bft-root fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground select-none"
      onPointerDownCapture={unlockAudio}
      onPointerUpCapture={wakeAudio}
      onTouchEndCapture={wakeAudio}
      onKeyDownCapture={unlockAudio}
    >
      <h1 className="sr-only">조율</h1>

      <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <TrainerTabs />
        <p className="min-w-0 flex-1 truncate text-center text-xs font-medium text-muted-foreground">
          {lockedTarget
            ? `${lockedTarget.number}번줄 ${lockedTarget.note} 고정 · 다시 누르면 자동`
            : "자동 감지 · 줄을 누르면 그 줄만 들어요"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill pressed={octaveUp} onClick={() => setOctaveUp(!octaveUp)}>
            옥타브 ↑
          </Pill>
          {listening && (
            <Pill onClick={tuner.stop} className="gap-1.5">
              <MicOff className="size-3.5" aria-hidden="true" />
              마이크 끄기
            </Pill>
          )}
        </div>
      </header>

      <div
        id="bft-content"
        tabIndex={-1}
        className="relative grid min-h-0 flex-1 grid-cols-[minmax(10.5rem,32%)_1fr] gap-3 p-3 outline-none"
      >
        <StringPanel
          view={view}
          locked={locked}
          listening={listening}
          onToggle={toggleLock}
          onReference={playReference}
        />

        <section aria-labelledby="tuner-title" className="flex min-h-0 min-w-0 flex-col justify-center">
          <h2 id="tuner-title" className="sr-only">
            음정
          </h2>
          {allPassed && <AllPassed onReset={tuner.resetPassed} />}
          {listening ? (
            <Readout view={view} locked={locked} />
          ) : (
            <StartPanel
              status={status}
              promptSlow={promptSlow}
              inPreview={inPreview}
              onStart={() => void tuner.start()}
              onCancel={tuner.stop}
            />
          )}
        </section>

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

// ── Strings (G on top … E at the bottom, like the fretboard) ───────────────

interface StringPanelProps {
  view: TunerView;
  locked: number | null;
  listening: boolean;
  onToggle: (row: number) => void;
  onReference: (row: number) => void;
}

function StringPanel({ view, locked, listening, onToggle, onReference }: StringPanelProps) {
  return (
    <section aria-labelledby="strings-title" className="flex min-h-0 flex-col">
      <h2 id="strings-title" className="sr-only">
        줄
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5">
        {TUNE_TARGETS.map((t) => {
          const s = STRINGS[t.row];
          const isLocked = locked === t.row;
          const current = listening && view.row === t.row && (isLocked || view.cents !== null);
          const ringing = current && view.live;
          const passed = view.passed.includes(t.row);
          return (
            <li key={t.row} className="flex min-h-0 flex-1 gap-1.5">
              <button
                type="button"
                aria-pressed={isLocked}
                onClick={() => onToggle(t.row)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  current
                    ? "bg-primary/20 ring-2 ring-primary"
                    : isLocked
                      ? "bg-accent ring-1 ring-primary/60"
                      : "bg-card hover:bg-accent",
                )}
              >
                <span className="w-9 shrink-0 text-[11px] font-semibold text-muted-foreground">{t.number}번줄</span>
                <span className={cn("w-6 shrink-0 text-2xl leading-none font-extrabold", TONE_TEXT[s.tone])}>
                  {t.note}
                </span>
                <span aria-hidden="true" className="relative h-full min-w-4 flex-1">
                  <span
                    className={cn("absolute inset-x-0 top-1/2 block rounded-full", ringing && "bft-string-live")}
                    style={{ height: s.gauge, marginTop: -s.gauge / 2, background: STRING_METAL }}
                  />
                </span>
                {passed ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                    <Check className="size-3" aria-hidden="true" />
                    통과
                  </span>
                ) : isLocked ? (
                  <span className="shrink-0 text-[11px] font-semibold text-foreground">고정</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onReference(t.row)}
                aria-label={`${t.number}번줄 ${t.note} 기준음 듣기`}
                className="flex w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Live readout ───────────────────────────────────────────────────────────

function Readout({ view, locked }: { view: TunerView; locked: number | null }) {
  const row = view.row ?? locked;
  const target = row === null ? null : TUNE_TARGETS[row];
  const cents = view.cents;
  const advice = adviceOf(cents);
  const zone = cents === null ? null : zoneOf(cents);
  const passed = row !== null && view.passed.includes(row);
  const dim = cents !== null && !view.live;
  const name = target ? `${target.number}번줄 ${target.note}` : "";

  let headline: string;
  let detail: string;
  let announce: string;
  if (cents === null || advice === "listen") {
    headline = "줄을 하나 튕겨 주세요";
    detail = target && locked !== null ? `${name} 줄을 튕기세요` : "튕긴 줄을 자동으로 찾아요";
    announce = "줄을 튕겨 주세요";
  } else if (advice === "ok") {
    headline = passed ? "통과!" : "정확해요";
    detail = passed ? "다음 줄로 넘어가세요" : "그대로 잠깐 유지하세요";
    announce = `${name} ${passed ? "통과" : "정확해요"}`;
  } else if (advice === "up") {
    headline = "올리세요";
    detail = `줄을 조이세요 — ${offsetText(cents)}`;
    announce = `${name} 올리세요`;
  } else {
    headline = "내리세요";
    detail = `줄을 푸세요 — ${offsetText(cents)}`;
    announce = `${name} 내리세요`;
  }
  const Icon = advice === "up" ? ArrowUp : advice === "down" ? ArrowDown : advice === "ok" ? Check : null;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 transition-opacity duration-300", dim && "opacity-60")}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <div className="flex items-center gap-4">
        <NoteDial target={target} zone={zone} hold={view.hold} passed={passed && advice === "ok"} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-2 leading-tight font-extrabold",
              advice === "listen" ? "text-xl text-foreground" : "text-3xl",
              zone && advice !== "listen" && ZONE_TEXT[zone],
            )}
          >
            {Icon && <Icon className="size-8 shrink-0" strokeWidth={3} aria-hidden="true" />}
            {headline}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{detail}</p>
          {target && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              목표 {target.hz.toFixed(1)} Hz
              {view.freq !== null && ` · 지금 ${view.freq.toFixed(1)} Hz`}
            </p>
          )}
        </div>
      </div>
      <figure className="m-0">
        <TuneMeter cents={cents} zone={zone} />
        <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">
          바늘이 가운데 초록 칸에 잠깐 머물면 통과
        </figcaption>
      </figure>
    </div>
  );
}

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function NoteDial({
  target,
  zone,
  hold,
  passed,
}: {
  target: TuneTarget | null;
  zone: Zone | null;
  hold: number;
  passed: boolean;
}) {
  const tone = target ? STRINGS[target.row].tone : null;
  const progress = passed ? 1 : hold;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle
          className="bft-tune-ring"
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          stroke={zone ? ZONE_COLOR[zone] : "transparent"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - progress)}
          opacity={progress > 0 ? 1 : 0}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("text-5xl font-extrabold", tone ? TONE_TEXT[tone] : "text-muted-foreground")}>
          {target ? target.note : "–"}
        </span>
        <span className="mt-1 text-[11px] font-semibold text-muted-foreground">
          {target ? `${target.number}번줄` : "자동"}
        </span>
      </div>
    </div>
  );
}

// ── Needle meter: −50 … 0 … +50 cents ─────────────────────────────────────

const CENTER = 200;
const HALF = 180;
const SCALE = HALF / METER_CENTS;
const ZONES: readonly (readonly [number, number, Zone])[] = [
  [-METER_CENTS, -NEAR_CENTS, "far"],
  [-NEAR_CENTS, -IN_TUNE_CENTS, "near"],
  [-IN_TUNE_CENTS, IN_TUNE_CENTS, "in"],
  [IN_TUNE_CENTS, NEAR_CENTS, "near"],
  [NEAR_CENTS, METER_CENTS, "far"],
];
const TICKS = Array.from({ length: (2 * METER_CENTS) / 5 + 1 }, (_, i) => -METER_CENTS + i * 5);

function TuneMeter({ cents, zone }: { cents: number | null; zone: Zone | null }) {
  const clamped = cents === null ? 0 : Math.max(-METER_CENTS, Math.min(METER_CENTS, cents));
  const dx = clamped * SCALE;
  const pinned = cents !== null && Math.abs(cents) > METER_CENTS;
  const desc =
    cents === null
      ? "아직 들리는 음이 없어요."
      : Math.abs(cents) <= IN_TUNE_CENTS
        ? "바늘이 가운데 초록 칸에 있어요 — 정확해요."
        : `${offsetText(cents)}.`;
  return (
    <svg
      viewBox="0 0 400 66"
      className="block w-full"
      role="img"
      aria-labelledby="bft-meter-title bft-meter-desc"
    >
      <title id="bft-meter-title">음정 미터 — 왼쪽은 낮음, 오른쪽은 높음</title>
      <desc id="bft-meter-desc">{desc}</desc>
      <defs>
        <clipPath id="bft-meter-track">
          <rect x={CENTER - HALF} y="20" width={HALF * 2} height="16" rx="8" />
        </clipPath>
      </defs>

      <text x={CENTER - HALF} y="12" fontSize="11" fontWeight="600" className="fill-muted-foreground">
        ◀ 낮음
      </text>
      <text x={CENTER + HALF} y="12" fontSize="11" fontWeight="600" textAnchor="end" className="fill-muted-foreground">
        높음 ▶
      </text>

      <g clipPath="url(#bft-meter-track)">
        {ZONES.map(([a, b, z]) => (
          <rect
            key={a}
            className="bft-meter-zone"
            data-zone={z}
            x={CENTER + a * SCALE}
            y="20"
            width={(b - a) * SCALE}
            height="16"
            fill={ZONE_FILL[z]}
          />
        ))}
      </g>

      {TICKS.map((c) => {
        const major = c % 25 === 0;
        return (
          <line
            key={c}
            x1={CENTER + c * SCALE}
            x2={CENTER + c * SCALE}
            y1="39"
            y2={major ? 47 : 43}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={c === 0 ? 2 : 1}
          />
        );
      })}
      <text x={CENTER - HALF} y="61" fontSize="10" className="fill-muted-foreground">
        −{METER_CENTS}
      </text>
      <text x={CENTER} y="61" fontSize="10" textAnchor="middle" className="fill-muted-foreground">
        0
      </text>
      <text x={CENTER + HALF} y="61" fontSize="10" textAnchor="end" className="fill-muted-foreground">
        +{METER_CENTS}
      </text>

      {pinned && (
        <text
          className="bft-pin"
          x={cents < 0 ? CENTER - HALF - 12 : CENTER + HALF + 12}
          y="33"
          fontSize="16"
          fontWeight="800"
          textAnchor="middle"
          fill={ZONE_COLOR.far}
        >
          {cents < 0 ? "«" : "»"}
        </text>
      )}

      <g className="bft-needle" style={{ transform: `translateX(${dx}px)`, opacity: cents === null ? 0.3 : 1 }}>
        <line x1={CENTER} y1="15" x2={CENTER} y2="41" stroke="#fafafa" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CENTER} cy="28" r="6" fill={zone ? ZONE_COLOR[zone] : "#a1a1aa"} stroke="#0b0b0f" strokeWidth="2" />
      </g>
    </svg>
  );
}

// ── Before the microphone is on ────────────────────────────────────────────

interface StartPanelProps {
  status: MicStatus;
  promptSlow: boolean;
  inPreview: boolean;
  onStart: () => void;
  onCancel: () => void;
}

function StartPanel({ status, promptSlow, inPreview, onStart, onCancel }: StartPanelProps) {
  const starting = status === "starting";
  const failed = status === "denied" || status === "unavailable" || status === "error";
  let problem: string | null = null;
  if (failed) {
    if (inPreview) problem = PREVIEW_TEXT;
    else if (status === "denied")
      problem = "마이크 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 마이크를 허용한 뒤 다시 눌러 주세요.";
    else if (status === "unavailable") problem = "이 기기나 브라우저에서는 마이크를 쓸 수 없어요.";
    else problem = "마이크를 시작하지 못했어요. 다른 앱이 마이크를 쓰고 있다면 닫고 다시 눌러 주세요.";
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl bg-card p-4 ring-1 ring-border">
      <h3 className="font-heading text-base font-bold">마이크로 조율</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        줄을 하나씩 튕기면 음을 듣고 올릴지 내릴지 알려줘요. 휴대폰을 베이스 몸통 가까이 두세요.
      </p>
      {inPreview && !failed && <p className="mt-2 text-xs font-medium text-amber-300">{PREVIEW_TEXT}</p>}
      {problem && (
        <p role="alert" className="mt-2 text-sm font-medium text-rose-300">
          {problem}
        </p>
      )}
      <button
        type="button"
        disabled={starting}
        onClick={onStart}
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
      >
        {starting ? (
          <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="size-4" aria-hidden="true" />
        )}
        {starting ? "마이크 준비 중…" : failed ? "다시 시도" : "마이크 켜고 시작"}
      </button>
      {starting && promptSlow && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>화면이나 주소창의 마이크 권한 요청을 확인해 주세요.</span>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full px-2 py-1 font-semibold text-foreground underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            취소
          </button>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Volume2 className="size-3.5 shrink-0" aria-hidden="true" />
        마이크 없이도 줄 옆 버튼으로 기준음을 듣고 귀로 맞출 수 있어요.
      </p>
    </div>
  );
}

function AllPassed({ onReset }: { onReset: () => void }) {
  return (
    <div
      role="status"
      className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-emerald-400/15 px-3 py-2 text-sm font-bold text-emerald-300 ring-1 ring-emerald-400/40"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Check className="size-4 shrink-0" aria-hidden="true" />
        4줄 모두 통과! 연습을 시작해도 좋아요
      </span>
      <Pill onClick={onReset} className="h-8 gap-1">
        <RotateCcw className="size-3.5" aria-hidden="true" />
        다시 확인
      </Pill>
    </div>
  );
}
