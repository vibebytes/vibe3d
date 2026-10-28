import { describe, expect, it } from 'vitest';
import { connectClient } from './helpers/client';

describe('能力声明', () => {
  it('只声明 tools 与 prompts', async () => {
    const { client } = await connectClient({
      runtime: async () => {
        throw new Error('x');
      },
    });
    const caps = client.getServerCapabilities();
    expect(caps?.tools).toBeTruthy();
    expect(caps?.prompts).toBeTruthy();
    expect(caps?.resources).toBeUndefined();
  });

  it('resources/list 返回 -32601', async () => {
    const { client } = await connectClient({
      runtime: async () => {
        throw new Error('x');
      },
    });
    await expect(
      client.request({ method: 'resources/list', params: {} }, { parse: (value: unknown) => value } as never),
    ).rejects.toMatchObject({
      code: -32601,
    });
  });
});
