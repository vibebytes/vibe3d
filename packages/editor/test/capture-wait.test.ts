import { describe, expect, it } from 'vitest';
import { waitForModels } from '../src/three/model-wait';

describe('waitForModels', () => {
  it('does not resolve until pending models are gone', async () => {
    let calls = 0;
    const pending = () => (++calls < 4 ? ['n_aaaaaaaa'] : []);
    await waitForModels({ pending, intervalMs: 1, timeoutMs: 1000 });
    expect(calls).toBe(4);
  });

  it('throws naming the nodes when the deadline passes', async () => {
    await expect(
      waitForModels({ pending: () => ['n_aaaaaaaa'], intervalMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow(/n_aaaaaaaa/);
  });

  it('throws immediately when a pending model already failed to load', async () => {
    await expect(
      waitForModels({
        pending: () => ['n_aaaaaaaa'],
        failed: () => ['n_aaaaaaaa'],
        intervalMs: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/加载失败/);
  });
});
