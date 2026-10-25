import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { ToolRuntime, listTools, toolByName } from '../src/tools';

const tools = listTools();
const byName = (name: string) => tools.find((tool) => tool.name === name);
const jsonOf = (result: { content: unknown[] }): Record<string, unknown> =>
  JSON.parse(String((result.content[0] as { text?: string } | undefined)?.text)) as Record<string, unknown>;

function fakeStudio(status: Record<string, unknown>) {
  const calls: string[] = [];
  const studio = {
    client: {
      call: async (method: string) => {
        calls.push(method);
        return status;
      },
    },
    room: () => ({ invoke: async () => ({}) }),
  };
  return { studio: studio as unknown as Studio, calls };
}

describe('vibe3d_status：不落盘的能力探测', () => {
  it('is advertised as a read-only daemon probe', () => {
    const tool = byName('vibe3d_status');
    expect(tool?.description).toContain('id-pass');
    expect((tool?.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint).toBe(true);
    expect(toolByName('vibe3d_status')?.ops[0]?.capability).toBe('system.status');
  });

  it('keeps render tool descriptions pointing at the probe', () => {
    expect(byName('vibe3d_render')?.description).toContain('vibe3d_status');
  });

  it('returns the daemon payload untouched', async () => {
    const payload = { renderer: { name: 'chromium', ready: true, idPass: true }, limits: {}, notes: [] };
    const { studio, calls } = fakeStudio(payload);
    const result = await new ToolRuntime(studio).call('vibe3d_status', {});
    expect(calls).toEqual(['system.status']);
    expect(jsonOf(result)).toEqual(payload);
  });
});
