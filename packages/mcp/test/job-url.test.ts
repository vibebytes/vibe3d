import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { ToolRuntime } from '../src/tools';

function studio(result: unknown): Studio {
  return {
    url: 'http://127.0.0.1:7777',
    client: { call: async () => result },
    createRoom: async () => ({ id: 'r_0000000a' }),
    room: () => ({ id: 'r_0000000a', invoke: async () => result }),
  } as unknown as Studio;
}

describe('export links are absolute in MCP results', () => {
  it('job.get rewrites /exports/ urls against the studio base url', async () => {
    const job = { jobId: 'j', state: 'done', url: '/exports/abc.mp4?exp=1&sig=s' };
    const out = await new ToolRuntime(studio(job), 'r_0000000a').call('vibe3d_job', {
      op: 'get',
      job_id: 'j',
    });
    expect(out.isError).toBeFalsy();
    expect((out.structuredContent as { url: string }).url).toBe(
      'http://127.0.0.1:7777/exports/abc.mp4?exp=1&sig=s',
    );
  });

  it('leaves absolute and non-export urls untouched', async () => {
    const job = { jobId: 'j', state: 'done', url: 'https://cdn/x.glb', openUrl: '/rooms/r' };
    const out = await new ToolRuntime(studio(job), 'r_0000000a').call('vibe3d_job', {
      op: 'get',
      job_id: 'j',
    });
    expect(out.structuredContent).toMatchObject({ url: 'https://cdn/x.glb', openUrl: '/rooms/r' });
  });
});
