import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  DOUBLE_DOT_FRET,
  FRET_COUNT,
  SINGLE_DOT_FRETS,
  STRINGS,
  cellKey,
  cellRect,
  computeLayout,
  displayName,
  flatOf,
  hitTest,
  isNatural,
  noteAt,
  positionLabel,
  screenX,
  type BoardLayout,
  type CellHit,
} from "@/lib/fretboard";

export type LabelMode = "natural" | "all" | "hidden";

/**
 * Highlight styles a page can put on individual cells (quiz feedback, this
 * week's map). A marked cell always shows its note name.
 */
export type CellMarkKind = "map" | "correct" | "wrong" | "target" | "best" | "ok" | "miss";

interface FretboardProps {
  /** Nut on the right (audience / photo view) instead of the left. */
  mirrored: boolean;
  labelMode: LabelMode;
  /** Fired once per pluck — pointer tap, finger slide into a new cell, or keyboard. */
  onPlay: (row: number, fret: number) => void;
  className?: string;
  /** Number of frets to draw after the nut (default 12). */
  frets?: number;
  /** Cells to highlight, keyed by `cellKey(row, fret)`. */
  marks?: Readonly<Record<string, CellMarkKind>>;
  /** Element id for the board (skip-link target); the board becomes focusable. */
  id?: string;
}

const MARK_RING: Record<CellMarkKind, string> = {
  map: "ring-2 ring-white/40",
  correct: "ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.65)]",
  best: "ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]",
  ok: "ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.55)]",
  wrong: "ring-2 ring-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.65)]",
  miss: "ring-2 ring-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.55)]",
  target: "ring-[3px] ring-primary shadow-[0_0_22px_var(--primary)] motion-safe:animate-pulse",
};

const FLASH_MS = 550;
/** A finger must be this far inside a neighbouring cell before a slide re-plucks. */
const SLIDE_MARGIN_PX = 8;
/** A click arriving this soon after a pointer pluck of the same cell is the same tap. */
const CLICK_DEDUPE_MS = 700;

// Instrument palette — deliberately fixed (a neck does not follow the OS theme).
const WOOD_TOP = "#241911";
const WOOD_MID = "#2c1f17";
const WOOD_BOTTOM = "#1a120d";
const HEADSTOCK = "#120d0a";
const INLAY = "#e7dac0";
const LABEL_RED = "#ff7a7a";
const LABEL_BLUE = "#6cb8ff";
const LABEL_SHARP = "#b5aea6";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function Fretboard({
  mirrored,
  labelMode,
  onPlay,
  className,
  frets = FRET_COUNT,
  marks,
  id,
}: FretboardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo<BoardLayout | null>(
    () => (size.w > 0 && size.h > 0 ? computeLayout(size.w, size.h, mirrored, frets) : null),
    [size, mirrored, frets],
  );

  // ── Tap flashes ─────────────────────────────────────────────────────────
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const flashTimers = useRef(new Map<string, number>());
  useEffect(() => {
    const timers = flashTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const trigger = useCallback(
    (row: number, fret: number) => {
      const key = cellKey(row, fret);
      const stamp = Date.now();
      setFlashes((f) => ({ ...f, [key]: stamp }));
      const pending = flashTimers.current.get(key);
      if (pending !== undefined) clearTimeout(pending);
      flashTimers.current.set(
        key,
        window.setTimeout(() => {
          flashTimers.current.delete(key);
          setFlashes((f) => {
            if (f[key] !== stamp) return f;
            const next = { ...f };
            delete next[key];
            return next;
          });
        }, FLASH_MS),
      );
      onPlay(row, fret);
    },
    [onPlay],
  );

  // ── Pointer handling (polyphonic: one entry per active pointerId) ───────
  const pointers = useRef(new Map<number, CellHit>());
  const lastPointerPluck = useRef(new Map<string, number>());

  const locate = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const pluckFromPointer = useCallback(
    (pointerId: number, hit: CellHit) => {
      pointers.current.set(pointerId, hit);
      lastPointerPluck.current.set(cellKey(hit.row, hit.fret), performance.now());
      trigger(hit.row, hit.fret);
    },
    [trigger],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = locate(e);
    if (!p) return;
    const hit = hitTest(layout, p.x, p.y);
    if (!hit) return;
    pluckFromPointer(e.pointerId, hit);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    const current = pointers.current.get(e.pointerId);
    if (!current) return;
    const p = locate(e);
    if (!p) return;
    const hit = hitTest(layout, p.x, p.y);
    if (!hit || (hit.row === current.row && hit.fret === current.fret)) return;
    const r = cellRect(layout, hit.row, hit.fret);
    const inset = Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y);
    if (inset < SLIDE_MARGIN_PX) return;
    pluckFromPointer(e.pointerId, hit);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  /** Keyboard / assistive-tech activation; pointer taps are already handled. */
  const onCellClick = (row: number, fret: number) => () => {
    const key = cellKey(row, fret);
    const t = lastPointerPluck.current.get(key);
    if (t !== undefined && performance.now() - t < CLICK_DEDUPE_MS) return;
    trigger(row, fret);
  };

  // ── Derived drawing metrics ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!layout) return null;
    const { rowH } = layout;
    const gaugeScale = clamp(rowH / 72, 0.75, 1.3);
    const inlayR = clamp(rowH * 0.14, 5, 10);
    return { gaugeScale, inlayR };
  }, [layout]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)} id={id} tabIndex={id ? -1 : undefined}>
      <div
        ref={boardRef}
        className="bft-board relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {layout && metrics && (
          <>
            <NeckArt layout={layout} gaugeScale={metrics.gaugeScale} inlayR={metrics.inlayR} />
            {STRINGS.map((s, row) => {
              const rowRect = cellRect(layout, row, 0);
              return (
                <div
                  key={s.number}
                  role="group"
                  aria-label={`${s.number}번줄 · ${s.open}`}
                  className="absolute left-0 right-0"
                  style={{ top: rowRect.y, height: rowRect.h }}
                >
                  {Array.from({ length: layout.frets + 1 }, (_, fret) => {
                    const rect = cellRect(layout, row, fret);
                    const note = noteAt(s.open, fret);
                    const natural = isNatural(note);
                    const flat = flatOf(note);
                    const key = cellKey(row, fret);
                    const stamp = flashes[key];
                    const active = stamp !== undefined;
                    const mark = marks?.[key];
                    const showLabel =
                      active ||
                      mark !== undefined ||
                      labelMode === "all" ||
                      (labelMode === "natural" && natural);
                    const disc = clamp(Math.min(rect.h * 0.6, rect.w * 0.78), 28, 54);
                    const color = natural ? (s.tone === "red" ? LABEL_RED : LABEL_BLUE) : LABEL_SHARP;
                    return (
                      <button
                        key={fret}
                        type="button"
                        className="bft-cell absolute top-0 flex h-full items-center justify-center rounded-none outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
                        style={{ left: rect.x, width: rect.w }}
                        aria-label={`${displayName(note)} · ${positionLabel(s, fret)}`}
                        data-active={active ? "true" : undefined}
                        data-mark={mark}
                        onClick={onCellClick(row, fret)}
                      >
                        {active && (
                          <span
                            key={stamp}
                            aria-hidden="true"
                            className="bft-ring"
                            style={{ width: disc * 1.25, height: disc * 1.25 }}
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "bft-disc relative flex flex-col items-center justify-center rounded-full leading-none transition-[background-color,box-shadow] duration-150",
                            showLabel ? "bg-[#150f0b]/92 ring-1 ring-white/10" : "bg-transparent",
                            mark && MARK_RING[mark],
                            active && !mark && "ring-2 ring-primary shadow-[0_0_18px_var(--primary)]",
                          )}
                          style={{
                            width: disc,
                            height: disc,
                            color,
                            fontSize: natural
                              ? disc * (fret === 0 ? 0.46 : 0.5)
                              : Math.max(10, disc * 0.3),
                            fontWeight: natural ? 800 : 600,
                          }}
                        >
                          {showLabel &&
                            (natural || !flat ? (
                              note
                            ) : (
                              // Accidental: sharp spelling on top, flat spelling below —
                              // the same pitch, both names visible at once.
                              <>
                                <span>{note}</span>
                                <span className="my-px h-px w-3/5 bg-current opacity-40" />
                                <span>{flat}</span>
                              </>
                            ))}
                          {fret === 0 && (
                            <span
                              className="mt-0.5 font-semibold text-foreground/85"
                              style={{ fontSize: Math.max(10, disc * 0.22) }}
                            >
                              {s.number}번
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Fret-number ruler along the bottom edge. */}
      <div className="relative h-5 shrink-0 text-[11px] leading-5 tabular-nums" aria-hidden="true">
        {layout && (
          <>
            <span
              className="absolute -translate-x-1/2 text-muted-foreground"
              style={{ left: screenX(layout, layout.openW / 2) }}
            >
              개방
            </span>
            {Array.from({ length: layout.frets }, (_, i) => i + 1).map((fret) => {
              const cx = screenX(layout, (layout.wires[fret - 1] + layout.wires[fret]) / 2);
              const marked =
                fret === DOUBLE_DOT_FRET || (SINGLE_DOT_FRETS as readonly number[]).includes(fret);
              return (
                <span
                  key={fret}
                  className={cn(
                    "absolute -translate-x-1/2",
                    marked ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                  style={{ left: cx }}
                >
                  {fret}
                </span>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Decorative neck artwork (strings, frets, nut, inlays) ─────────────────

interface NeckArtProps {
  layout: BoardLayout;
  gaugeScale: number;
  inlayR: number;
}

function NeckArt({ layout, gaugeScale, inlayR }: NeckArtProps) {
  const { width: w, height: h, rowH, openW, nutW, wires, mirrored, frets } = layout;
  const headX = mirrored ? w - openW : 0;
  const nutX = mirrored ? w - openW - nutW : openW;
  const singleDots = SINGLE_DOT_FRETS.filter((f) => f <= frets);
  const doubleDot = frets >= DOUBLE_DOT_FRET;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="bft-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={WOOD_TOP} />
          <stop offset="0.5" stopColor={WOOD_MID} />
          <stop offset="1" stopColor={WOOD_BOTTOM} />
        </linearGradient>
        <linearGradient id="bft-nut" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f5ecd8" />
          <stop offset="1" stopColor="#c9bc9f" />
        </linearGradient>
        <linearGradient id="bft-fret" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#77777d" />
          <stop offset="0.5" stopColor="#ececf0" />
          <stop offset="1" stopColor="#84848a" />
        </linearGradient>
        <linearGradient id="bft-string" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f4f6" />
          <stop offset="0.55" stopColor="#c9c9ce" />
          <stop offset="1" stopColor="#8e8e94" />
        </linearGradient>
      </defs>

      {/* Fingerboard */}
      <rect x="0" y="0" width={w} height={h} fill="url(#bft-wood)" />
      {/* Headstock side, beyond the nut */}
      <rect x={headX} y="0" width={openW} height={h} fill={HEADSTOCK} />

      {/* Inlays */}
      {singleDots.map((fret) => (
        <circle
          key={fret}
          cx={screenX(layout, (wires[fret - 1] + wires[fret]) / 2)}
          cy={h / 2}
          r={inlayR}
          fill={INLAY}
          opacity="0.5"
        />
      ))}
      {doubleDot &&
        [rowH, rowH * 3].map((cy) => (
          <circle
            key={cy}
            cx={screenX(layout, (wires[DOUBLE_DOT_FRET - 1] + wires[DOUBLE_DOT_FRET]) / 2)}
            cy={cy}
            r={inlayR}
            fill={INLAY}
            opacity="0.5"
          />
        ))}

      {/* Fret wires */}
      {wires.slice(1).map((x, i) => {
        const sx = screenX(layout, x);
        return (
          <g key={i}>
            <rect x={sx + (mirrored ? -3 : 1.5)} y="0" width="1.5" height={h} fill="#000" opacity="0.4" />
            <rect x={sx - 1.5} y="0" width="3" height={h} fill="url(#bft-fret)" />
          </g>
        );
      })}

      {/* Nut */}
      <rect x={nutX + (mirrored ? -2 : nutW)} y="0" width="2" height={h} fill="#000" opacity="0.45" />
      <rect x={nutX} y="0" width={nutW} height={h} fill="url(#bft-nut)" />

      {/* Strings: G (thinnest) at the top … E (thickest) at the bottom */}
      {STRINGS.map((s, row) => {
        const g = s.gauge * gaugeScale;
        const y = rowH * (row + 0.5);
        return (
          <g key={s.number}>
            <rect x="0" y={y + g / 2} width={w} height={Math.max(1, g * 0.35)} fill="#000" opacity="0.45" />
            <rect x="0" y={y - g / 2} width={w} height={g} fill="url(#bft-string)" />
            {s.number !== 1 && (
              <line
                x1="0"
                y1={y}
                x2={w}
                y2={y}
                stroke="#000"
                strokeOpacity="0.16"
                strokeWidth={g}
                strokeDasharray="1 2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
