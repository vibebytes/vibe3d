import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceTime,
  durationOf,
  frameOf,
  frameToTime,
  usePlayback,
} from '../src/stores/playback';

const RANGE = { start: 1, end: 250, fps: 24 };

describe('播放条时间换算', () => {
  it('首帧对应 0 秒，帧号与秒可互换', () => {
    expect(frameToTime(1, RANGE)).toBe(0);
    expect(frameToTime(25, RANGE)).toBeCloseTo(1);
    expect(frameOf(RANGE, 0)).toBe(1);
    expect(frameOf(RANGE, 1)).toBe(25);
  });

  it('时长覆盖首末帧', () => {
    expect(durationOf(RANGE)).toBeCloseTo(250 / 24);
  });

  it('fps 为 0 时按 1 处理，避免除零', () => {
    expect(frameToTime(3, { start: 1, end: 10, fps: 0 })).toBe(2);
    expect(durationOf({ start: 1, end: 0, fps: 0 })).toBe(1);
  });
});

describe('advanceTime', () => {
  it('循环时回绕到区间开头', () => {
    expect(advanceTime(0.9, 0.2, 1, true)).toBeCloseTo(0.1);
  });

  it('不循环时停在末尾', () => {
    expect(advanceTime(0.9, 0.2, 1, false)).toBe(1);
  });
});

describe('usePlayback 播放控制', () => {
  beforeEach(() => usePlayback.getState().reset());

  it('缺省自动播放、24fps、1..250、循环', () => {
    const s = usePlayback.getState();
    expect(s.playing).toBe(true);
    expect(s.fps).toBe(24);
    expect(s.start).toBe(1);
    expect(s.end).toBe(250);
    expect(s.loop).toBe(true);
    expect(s.time).toBe(0);
  });

  it('play / pause / toggle', () => {
    const p = usePlayback.getState();
    p.pause();
    expect(usePlayback.getState().playing).toBe(false);
    usePlayback.getState().toggle();
    expect(usePlayback.getState().playing).toBe(true);
  });

  it('暂停时 advance 不动，播放时按 delta 前进', () => {
    usePlayback.getState().advance(0.5);
    expect(usePlayback.getState().time).toBeCloseTo(0.5);
    usePlayback.getState().pause();
    usePlayback.getState().advance(0.5);
    expect(usePlayback.getState().time).toBeCloseTo(0.5);
  });

  it('循环播放回绕，不循环到达末帧后暂停', () => {
    const p = usePlayback.getState();
    p.setRange(1, 24); // 24 帧 @24fps = 1 秒
    usePlayback.getState().seekTime(0.9);
    usePlayback.getState().advance(0.2);
    expect(usePlayback.getState().time).toBeCloseTo(0.1);

    usePlayback.getState().setLoop(false);
    usePlayback.getState().seekTime(0.9);
    usePlayback.getState().advance(0.2);
    expect(usePlayback.getState().time).toBeCloseTo(1);
    expect(usePlayback.getState().playing).toBe(false);
  });

  it('seekFrame 夹在区间内并同步时间', () => {
    const p = usePlayback.getState();
    p.seekFrame(25);
    expect(usePlayback.getState().time).toBeCloseTo(1);
    p.seekFrame(0);
    expect(usePlayback.getState().time).toBe(0);
    p.seekFrame(9999);
    expect(frameOf(usePlayback.getState(), usePlayback.getState().time)).toBe(250);
  });

  it('step 按帧步进并夹紧', () => {
    const p = usePlayback.getState();
    p.step(1);
    expect(frameOf(usePlayback.getState(), usePlayback.getState().time)).toBe(2);
    p.goToStart();
    p.step(-1);
    expect(usePlayback.getState().time).toBe(0);
    p.goToEnd();
    expect(frameOf(usePlayback.getState(), usePlayback.getState().time)).toBe(250);
  });

  it('改 fps 保持当前帧', () => {
    const p = usePlayback.getState();
    p.seekFrame(25);
    p.setFps(12);
    expect(frameOf(usePlayback.getState(), usePlayback.getState().time)).toBe(25);
  });

  it('改区间后时间夹在新区间内', () => {
    const p = usePlayback.getState();
    p.goToEnd();
    p.setRange(1, 25);
    expect(usePlayback.getState().time).toBeLessThanOrEqual(1);
    expect(frameOf(usePlayback.getState(), usePlayback.getState().time)).toBe(25);
  });
});
