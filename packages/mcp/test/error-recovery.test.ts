import { CAPABILITIES } from '@vibebyte/vibe3d-capabilities';
import type { Studio } from '@vibebyte/vibe3d-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schemaHint } from '../src/hints';
import { type ToolResult, ToolRuntime } from '../src/tools';

function fakeStudio() {
  const calls: Array<{ method: string; roomId?: string; params: Record<string, unknown> }> = [];
  const studio = {
    client: { call: async () => ({}) },
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: (roomId: string) => ({
      id: roomId,
      invoke: async (method: string, params: Record<string, unknown>) => {
        calls.push({ method, roomId, params });
        return { revision: 2, stage: params.stage };
      },
    }),
  };
  return { studio: studio as unknown as Studio, calls };
}

const jsonOf = (result: ToolResult): Record<string, unknown> => {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as Record<string, unknown>;
};

async function bound() {
  const { studio, calls } = fakeStudio();
  const runtime = new ToolRuntime(studio);
  const used = await runtime.call('vibe3d_use_room', { roomId: 'r_0000000a' });
  expect(used.isError).toBeFalsy();
  return { runtime, calls };
}

const stageInput = CAPABILITIES['stage.set'].input;

describe('stage 简写输入', () => {
  it('accepts a bare preset name and normalises it to an object', () => {
    const parsed = stageInput.safeParse({ roomId: 'r_0000000a', stage: 'cine' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.stage).toEqual({ preset: 'cine' });
  });

  it('still accepts the object form', () => {
    const parsed = stageInput.safeParse({ roomId: 'r_0000000a', stage: { preset: 'flat', ground: false } });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.stage).toEqual({ preset: 'flat', ground: false });
  });

  it('rejects an unknown preset', () => {
    expect(stageInput.safeParse({ roomId: 'r_0000000a', stage: 'nope' }).success).toBe(false);
  });

  it('passes the normalised stage through a real tool call', async () => {
    const { runtime, calls } = await bound();
    const result = await runtime.call('vibe3d_set_stage', { stage: 'cine' });
    expect(result.isError).toBeFalsy();
    expect(calls.at(-1)?.params.stage).toEqual({ preset: 'cine' });
  });
});

describe('schema hints', () => {
  it('suggests an object example instead of telling the model to send an array', () => {
    const hint = schemaHint(
      { stage: 'cine' },
      [{ path: ['stage'], message: 'Expected object, received string' }],
      stageInput,
    );
    expect(hint).not.toContain('请直接传数组');
    expect(hint).toContain('preset');
  });

  it('lists the legal enum values when a preset name is wrong', () => {
    const hint = schemaHint(
      { stage: 'nope' },
      [{ path: ['stage'], message: 'Invalid enum value' }],
      stageInput,
    );
    expect(hint).toContain('cine');
    expect(hint).toContain('clean');
    expect(hint).toContain('flat');
  });

  it('keeps the array advice for array fields', () => {
    const hint = schemaHint(
      { ops: 'abc' },
      [{ path: ['ops'], message: 'Expected array, received string' }],
      CAPABILITIES['ops.apply'].input,
    );
    expect(hint).toContain('数组');
  });

  it('returns nothing when the value type already matches', () => {
    expect(
      schemaHint({ stage: { preset: 'cine' } }, [{ path: ['stage'], message: 'Required' }], stageInput),
    ).toBe('');
  });
});

describe('tool error telemetry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes a structured tool.error line to stderr on schema failure', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const { runtime } = await bound();
    const result = await runtime.call('vibe3d_set_stage', { stage: 'nope' });
    expect(result.isError).toBe(true);
    const line = writes.find((w) => w.includes('"event":"tool.error"'));
    expect(line).toBeTruthy();
    const entry = JSON.parse(String(line)) as Record<string, unknown>;
    expect(entry.tool).toBe('vibe3d_set_stage');
    expect(entry.code).toBe('E_INVALID_PARAMS');
    expect(entry.field).toBe('stage');
    expect(entry.received).toBe('string');
  });

  it('carries the reason in the failure payload', async () => {
    const { runtime } = await bound();
    const body = jsonOf(await runtime.call('vibe3d_set_stage', { stage: 'nope' }));
    expect(body.code).toBe('E_INVALID_PARAMS');
    expect(String(body.message)).toMatch(/cine|clean|flat/);
  });
});
