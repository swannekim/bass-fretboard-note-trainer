import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Smartphone } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Fretboard, type LabelMode } from "@/components/fretboard";
import { Pill } from "@/components/pill";
import { TrainerTabs } from "@/components/trainer-tabs";
import { useTrainerChrome } from "@/hooks/use-trainer-chrome";
import { pluck, unlockAudio } from "@/lib/bass-audio";
import {
  STRINGS,
  displayName,
  frequencyAt,
  noteAt,
  positionLabel,
  type LabelTone,
  type NoteName,
} from "@/lib/fretboard";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const LABEL_MODES: readonly LabelMode[] = ["natural", "all", "hidden"];
const LABEL_MODE_TEXT: Record<LabelMode, string> = {
  natural: "자연음",
  all: "전체 ♯♭",
  hidden: "숨김",
};

interface LastNote {
  note: NoteName;
  where: string;
  tone: LabelTone;
}

export function HomePage() {
  const { portrait } = useTrainerChrome();
  const { mirrored, setMirrored, octaveUp, setOctaveUp } = useAppStore(
    useShallow((s) => ({
      mirrored: s.mirrored,
      setMirrored: s.setMirrored,
      octaveUp: s.octaveUp,
      setOctaveUp: s.setOctaveUp,
    })),
  );
  const [labelMode, setLabelMode] = useState<LabelMode>("natural");
  const [last, setLast] = useState<LastNote | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handlePlay = useCallback(
    (row: number, fret: number) => {
      const s = STRINGS[row];
      const note = noteAt(s.open, fret);
      try {
        pluck(frequencyAt(s.openHz, fret, octaveUp));
      } catch {
        // Web Audio unavailable in this browser — the visual trainer still works.
      }
      setLast({ note, where: positionLabel(s, fret), tone: s.tone });
    },
    [octaveUp],
  );

  const cycleLabelMode = () => {
    setLabelMode((m) => LABEL_MODES[(LABEL_MODES.indexOf(m) + 1) % LABEL_MODES.length]);
  };

  const toggleFullscreen = () => {
    const run = async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return;
        }
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        const orientation = screen.orientation as unknown as {
          lock?: (orientation: string) => Promise<void>;
        };
        await orientation.lock?.("landscape");
      } catch {
        // Fullscreen or orientation lock unsupported here (e.g. iPhone Safari) — stay inline.
      }
    };
    void run();
  };

  return (
    <div
      className="bft-root fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground select-none"
      onPointerDownCapture={unlockAudio}
      onPointerUpCapture={unlockAudio}
      onTouchEndCapture={unlockAudio}
      onKeyDownCapture={unlockAudio}
    >
      <h1 className="sr-only">지판</h1>

      <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <TrainerTabs />

        <div
          className="flex min-w-0 flex-1 items-baseline justify-center gap-2 truncate"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {last ? (
            <>
              <span
                className={cn(
                  "text-2xl font-extrabold leading-none tabular-nums",
                  last.tone === "red" ? "text-[#ff7a7a]" : "text-[#6cb8ff]",
                )}
              >
                {displayName(last.note)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{last.where}</span>
            </>
          ) : (
            <span className="truncate text-xs text-muted-foreground">줄이나 프렛을 누르면 소리가 납니다</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Pill onClick={cycleLabelMode}>라벨 · {LABEL_MODE_TEXT[labelMode]}</Pill>
          <Pill pressed={mirrored} onClick={() => setMirrored(!mirrored)}>
            좌우 반전
          </Pill>
          <Pill pressed={octaveUp} onClick={() => setOctaveUp(!octaveUp)}>
            옥타브 ↑
          </Pill>
          {canFullscreen && (
            <Pill
              pressed={fullscreen}
              onClick={toggleFullscreen}
              label={fullscreen ? "전체화면 해제" : "전체화면"}
              className="w-9 px-0"
            >
              {fullscreen ? (
                <Minimize2 className="size-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-4" aria-hidden="true" />
              )}
            </Pill>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <Fretboard
          id="bft-content"
          mirrored={mirrored}
          labelMode={labelMode}
          onPlay={handlePlay}
          className="h-full"
        />

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

