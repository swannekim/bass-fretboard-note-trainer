import { useCallback, useEffect, useRef, useState } from "react";
import { decimateInto, detectPitch, rms } from "@/lib/pitch";
import { EMPTY_VIEW, TunerTracker, searchBand, type TunerView } from "@/lib/tuner";

/**
 * Microphone → pitch → tuner view.
 *
 * The microphone is opened only from `start()` (a user tap), runs through a
 * band-pass in its own AudioContext (created after permission is granted, so
 * it matches the hardware rate the microphone switched to), and is analysed
 * ~20× a second. Everything is released on `stop()`, on unmount, and when the
 * system ends the track. Expected failures (permission refused, no device,
 * the in-chat preview) log a warning, not an error, and surface as a status.
 */

export type MicStatus = "idle" | "starting" | "listening" | "denied" | "unavailable" | "error";

const FFT_SIZE = 8192;
const TARGET_RATE = 12000;
const ANALYSIS_MS = 45;
const VIEW_MS = 60;
/** Absolute floor for the input level gate (after the band-pass). */
const MIN_LEVEL = 0.0005;
/** A frame must be this many times louder than the tracked room noise. */
const NOISE_RATIO = 3;
const MIN_CLARITY = 0.75;
const PROMPT_SLOW_MS = 8000;

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;
interface WakeLockLike {
  release: () => Promise<void>;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
};

interface Session {
  ctx: AudioContext;
  stream: MediaStream;
  nodes: AudioNode[];
  analyser: AnalyserNode;
  raw: Float32Array<ArrayBuffer>;
  dec: Float32Array<ArrayBuffer>;
  scratch: Float32Array<ArrayBuffer>;
  factor: number;
  rate: number;
  raf: number;
  noise: number;
  lastAnalysis: number;
  lastView: number;
  wake: WakeLockLike | null;
}

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

function buildSession(Ctor: AudioContextCtor, stream: MediaStream): Session {
  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: "interactive" });
  } catch {
    ctx = new Ctor();
  }
  try {
    const source = ctx.createMediaStreamSource(stream);
    // Band-pass for bass: drop rumble below the low E and everything above
    // the overtones the detector uses (it then decimates to ~12 kHz).
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 25;
    highpass.Q.value = 0.707;
    const lowA = ctx.createBiquadFilter();
    lowA.type = "lowpass";
    lowA.frequency.value = 1000;
    lowA.Q.value = 0.707;
    const lowB = ctx.createBiquadFilter();
    lowB.type = "lowpass";
    lowB.frequency.value = 1000;
    lowB.Q.value = 0.707;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    // Silent sink so every browser keeps pulling audio through the analyser.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(highpass);
    highpass.connect(lowA);
    lowA.connect(lowB);
    lowB.connect(analyser);
    analyser.connect(sink);
    sink.connect(ctx.destination);

    const factor = Math.max(1, Math.round(ctx.sampleRate / TARGET_RATE));
    const rate = ctx.sampleRate / factor;
    return {
      ctx,
      stream,
      nodes: [source, highpass, lowA, lowB, analyser, sink],
      analyser,
      raw: new Float32Array(FFT_SIZE),
      dec: new Float32Array(Math.floor(FFT_SIZE / factor)),
      scratch: new Float32Array(Math.ceil(rate / 20) + 4),
      factor,
      rate,
      raf: 0,
      noise: 0.001,
      lastAnalysis: 0,
      lastView: 0,
      wake: null,
    };
  } catch (err) {
    void ctx.close().catch(() => undefined);
    throw err;
  }
}

function teardown(s: Session): void {
  cancelAnimationFrame(s.raf);
  for (const track of s.stream.getTracks()) track.stop();
  for (const node of s.nodes) {
    try {
      node.disconnect();
    } catch {
      // already disconnected
    }
  }
  if (s.wake) void s.wake.release().catch(() => undefined);
  void s.ctx.close().catch(() => undefined);
}

export interface MicTuner {
  status: MicStatus;
  /** The permission prompt has been open a while — the user may not have seen it. */
  promptSlow: boolean;
  view: TunerView;
  start: () => Promise<void>;
  stop: () => void;
  /** Resume audio after the system paused it (call from a tap). */
  resume: () => void;
  /** Ignore the microphone for `ms` — while the phone itself plays a reference tone. */
  muteFor: (ms: number) => void;
  /** Judge only this string (null = auto-detect). */
  setLocked: (row: number | null) => void;
  resetPassed: () => void;
}

export function useMicTuner(onPass?: (row: number) => void): MicTuner {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [promptSlow, setPromptSlow] = useState(false);
  const [view, setView] = useState<TunerView>(EMPTY_VIEW);
  const [tracker] = useState(() => new TunerTracker());
  const session = useRef<Session | null>(null);
  const token = useRef(0);
  const muteUntil = useRef(0);
  const locked = useRef<number | null>(null);
  const onPassRef = useRef(onPass);

  useEffect(() => {
    onPassRef.current = onPass;
  }, [onPass]);

  /** Release the microphone and cancel any start still waiting on the permission prompt. */
  const release = useCallback(() => {
    token.current += 1;
    const s = session.current;
    session.current = null;
    if (s) teardown(s);
  }, []);

  // Leaving the page always turns the microphone off.
  useEffect(() => release, [release]);

  // Coming back from the background: browsers suspend audio there.
  useEffect(() => {
    const onVisible = () => {
      const s = session.current;
      if (s && document.visibilityState === "visible" && s.ctx.state !== "running") {
        void s.ctx.resume().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const stop = useCallback(() => {
    release();
    setStatus("idle");
    setPromptSlow(false);
    tracker.clearReading();
    setView(tracker.snapshot());
  }, [release, tracker]);

  const start = useCallback(async () => {
    if (session.current) return;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const Ctor = audioContextCtor();
    if (!media || typeof media.getUserMedia !== "function" || !Ctor) {
      setStatus("unavailable");
      return;
    }
    const mine = ++token.current;
    setStatus("starting");
    setPromptSlow(false);
    const slowTimer = window.setTimeout(() => {
      if (token.current === mine) setPromptSlow(true);
    }, PROMPT_SLOW_MS);

    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({
        audio: {
          // Voice processing would treat a sustained note as noise and bend it.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
    } catch (err) {
      window.clearTimeout(slowTimer);
      if (token.current !== mine) return;
      console.warn("Tuner: microphone unavailable", err);
      const name = err instanceof DOMException ? err.name : "";
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError"
            ? "unavailable"
            : "error",
      );
      setPromptSlow(false);
      return;
    }
    window.clearTimeout(slowTimer);
    if (token.current !== mine) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    let s: Session;
    try {
      s = buildSession(Ctor, stream);
    } catch (err) {
      console.warn("Tuner: audio setup failed", err);
      for (const track of stream.getTracks()) track.stop();
      setStatus("error");
      setPromptSlow(false);
      return;
    }
    session.current = s;
    void s.ctx.resume().catch(() => undefined);

    for (const track of stream.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (session.current !== s) return;
        release();
        setStatus("idle");
        tracker.clearReading();
        setView(tracker.snapshot());
      });
    }

    // Keep the screen awake while tuning (best effort).
    const nav = navigator as WakeLockNavigator;
    nav.wakeLock?.request("screen").then(
      (w) => {
        if (session.current === s) s.wake = w;
        else void w.release().catch(() => undefined);
      },
      () => undefined,
    );

    const loop = (now: number) => {
      if (session.current !== s) return;
      s.raf = requestAnimationFrame(loop);
      if (now - s.lastAnalysis < ANALYSIS_MS) return;
      s.lastAnalysis = now;

      s.analyser.getFloatTimeDomainData(s.raw);
      const n = decimateInto(s.raw, s.factor, s.dec);
      const level = rms(s.dec, n);
      let freq: number | null = null;
      if (now >= muteUntil.current) {
        if (level > Math.max(MIN_LEVEL, s.noise * NOISE_RATIO)) {
          const [lo, hi] = searchBand(locked.current);
          const est = detectPitch(s.dec, n, s.rate, lo, hi, s.scratch);
          if (est && est.clarity >= MIN_CLARITY) freq = est.freq;
        }
        if (freq === null) {
          // Follow the room's noise floor — quickly down, slowly up.
          const rate = level < s.noise ? 0.2 : 0.02;
          s.noise += rate * (Math.min(level, s.noise * 4 + 1e-5) - s.noise);
        }
      }

      const v = tracker.update(freq, now);
      if (v.justPassed !== null) onPassRef.current?.(v.justPassed);
      if (v.justPassed !== null || now - s.lastView >= VIEW_MS) {
        s.lastView = now;
        setView(v);
      }
    };
    s.raf = requestAnimationFrame(loop);
    setStatus("listening");
    setPromptSlow(false);
  }, [release, tracker]);

  const resume = useCallback(() => {
    const s = session.current;
    if (s && s.ctx.state !== "running") void s.ctx.resume().catch(() => undefined);
  }, []);

  const muteFor = useCallback((ms: number) => {
    muteUntil.current = performance.now() + ms;
  }, []);

  const setLocked = useCallback(
    (row: number | null) => {
      locked.current = row;
      tracker.setLocked(row);
      setView(tracker.snapshot());
    },
    [tracker],
  );

  const resetPassed = useCallback(() => {
    tracker.resetPassed();
    setView(tracker.snapshot());
  }, [tracker]);

  return { status, promptSlow, view, start, stop, resume, muteFor, setLocked, resetPassed };
}
