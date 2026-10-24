import { describe, expect, it } from 'vitest';
import type { AutoOpenState } from '../src/context';
import { surfaceHint } from '../src/handlers/editor-url';
import { call, makeHarness } from './helpers/harness';

const base = { baseUrl: 'http://127.0.0.1:7777', token: 'tk' };

function hint(state: AutoOpenState | undefined, surfaces = 0): string | undefined {
  return surfaceHint(
    {
      ...base,
      surfaces: () => surfaces,
      autoOpen: state ? new Map<string, AutoOpenState>([['r_a', state]]) : new Map(),
    },
    'r_a',
  );
}

describe('surfaceHint：窗口已经开过时，不要让模型再调用 open_editor', () => {
  it('已自动打开时直接说明，不再要求调用工具', () => {
    const text = hint('opened');
    expect(text).toContain('已自动打开');
    expect(text).toContain('不要再调用');
    expect(text).toContain('/editor/r/r_a');
  });

  it('正在打开时提示等待刷新，而不是重复开窗', () => {
    const text = hint('pending');
    expect(text).toContain('正在打开');
    expect(text).toContain('1–2 秒');
    expect(text).not.toContain('调用 vibe3d_open_editor');
  });

  it('开窗失败时给出手动链接', () => {
    const text = hint('failed');
    expect(text).toContain('自动打开失败');
    expect(text).toContain('/editor/r/r_a');
  });

  it('没有自动开窗记录时保留原来的工具提示', () => {
    expect(hint(undefined)).toContain('调用 vibe3d_open_editor');
  });

  it('已有编辑器连接时不给任何提示', () => {
    expect(hint('opened', 1)).toBeUndefined();
    expect(hint(undefined, 2)).toBeUndefined();
  });
});

const STAGE = { preset: 'clean', autoExposure: true, ground: true, keepModelLights: false } as const;
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe('集成：写操作之后不再催模型重复开窗', () => {
  it('自动开窗成功后 hint 不再要求调用 open_editor', async () => {
    const h = makeHarness();
    h.ctx.openExternal = async () => true;
    const { body } = await call(h, 'room.create', { name: '提示' });
    const roomId = body.result.roomId;
    await tick();
    expect(h.ctx.autoOpen?.get(roomId)).toBe('opened');
    const applied = await call(h, 'ops.apply', { roomId, ops: [{ op: 'stage.set', stage: STAGE }] }, roomId);
    expect(applied.body.result.hint ?? '').toContain('已自动打开');
    expect(applied.body.result.hint ?? '').not.toContain('：调用 vibe3d_open_editor 打开');
  });

  it('开窗失败时 hint 说明失败并给出链接', async () => {
    const h = makeHarness();
    h.ctx.openExternal = () => false;
    const { body } = await call(h, 'room.create', { name: '失败' });
    const roomId = body.result.roomId;
    await tick();
    expect(h.ctx.autoOpen?.get(roomId)).toBe('failed');
    const applied = await call(h, 'ops.apply', { roomId, ops: [{ op: 'stage.set', stage: STAGE }] }, roomId);
    expect(applied.body.result.hint ?? '').toContain('自动打开失败');
  });
});
