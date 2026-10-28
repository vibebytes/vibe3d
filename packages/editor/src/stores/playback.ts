import { create } from 'zustand';

export interface PlaybackRange {
  start: number;
  end: number;
  fps: number;
}

export interface PlaybackState extends PlaybackRange {
  playing: boolean;
  loop: boolean;
  time: number;
  play(): void;
  pause(): void;
  toggle(): void;
  advance(dt: number): void;
  seekTime(time: number): void;
  seekFrame(frame: number): void;
  step(frames: number): void;
  goToStart(): void;
  goToEnd(): void;
  setFps(fps: number): void;
  setRange(start: number, end: number): void;
  setLoop(loop: boolean): void;
  reset(): void;
}

const DEFAULTS = { start: 1, end: 250, fps: 24, playing: false, loop: true, time: 0 };

export function safeFps(fps: number): number {
  return Number.isFinite(fps) && fps > 0 ? fps : 1;
}

export function frameToTime(frame: number, range: PlaybackRange): number {
  return (frame - range.start) / safeFps(range.fps);
}

export function frameOf(range: PlaybackRange, time: number): number {
  return Math.round(range.start + time * safeFps(range.fps));
}

export function durationOf(range: PlaybackRange): number {
  return Math.max(1, range.end - range.start + 1) / safeFps(range.fps);
}

export function advanceTime(time: number, dt: number, duration: number, loop: boolean): number {
  const next = time + dt;
  if (next < duration) return Math.max(0, next);
  if (!loop) return duration;
  return duration > 0 ? next % duration : 0;
}

function clampFrame(frame: number, range: PlaybackRange): number {
  const rounded = Math.round(frame);
  const lo = Math.min(range.start, range.end);
  const hi = Math.max(range.start, range.end);
  return Math.min(hi, Math.max(lo, rounded));
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  ...DEFAULTS,

  play() {
    set({ playing: true });
  },

  pause() {
    set({ playing: false });
  },

  toggle() {
    set({ playing: !get().playing });
  },

  advance(dt) {
    const s = get();
    if (!s.playing || !(dt > 0)) return;
    const duration = durationOf(s);
    const next = advanceTime(s.time, dt, duration, s.loop);
    const stopped = !s.loop && next >= duration;
    set({ time: next, playing: stopped ? false : s.playing });
  },

  seekTime(time) {
    const s = get();
    const max = durationOf(s);
    set({ time: Math.min(max, Math.max(0, time)) });
  },

  seekFrame(frame) {
    const s = get();
    set({ time: frameToTime(clampFrame(frame, s), s) });
  },

  step(frames) {
    const s = get();
    const next = clampFrame(frameOf(s, s.time) + frames, s);
    set({ time: frameToTime(next, s) });
  },

  goToStart() {
    const s = get();
    set({ time: frameToTime(Math.min(s.start, s.end), s) });
  },

  goToEnd() {
    const s = get();
    set({ time: frameToTime(Math.max(s.start, s.end), s) });
  },

  setFps(fps) {
    const s = get();
    const frame = frameOf(s, s.time);
    const next = { ...s, fps: safeFps(fps) };
    set({ fps: next.fps, time: frameToTime(frame, next) });
  },

  setRange(start, end) {
    const s = get();
    const next = { start, end, fps: s.fps };
    const frame = clampFrame(frameOf(s, s.time), next);
    set({ start, end, time: frameToTime(frame, next) });
  },

  setLoop(loop) {
    set({ loop });
  },

  reset() {
    set({ ...DEFAULTS });
  },
}));
