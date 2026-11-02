import { describe, expect, it } from 'vitest';
import { call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function runner() {
  const h = makeHarness();
  const { body } = await call(h, 'room.create', { name: 'gait' });
  const roomId = body.result.roomId as string;
  const made = await call(h, 'mesh.mannequin', { roomId, name: 'runner' }, roomId);
  return { h, roomId, nodeId: made.body.result.nodeId as string };
}

describe('animation.gait', () => {
  it('applies a looping run to a mannequin and reports the clip it wrote', async () => {
    const { h, roomId, nodeId } = await runner();
    const { body } = await call(h, 'animation.gait', { roomId, nodeId: '@runner', style: 'run' }, roomId);
    expect(body.error).toBeUndefined();
    expect(body.result.nodeId).toBe(nodeId);
    expect(body.result.drift[2]).toBeGreaterThan(0);
    const view = await call(h, 'node.get', { roomId, nodeId }, roomId);
    const paths = view.body.result.clips.flatMap((c: any) => c.tracks.map((t: any) => t.path));
    expect(paths).toContain('bone.UpperLeg_L.rotation');
  });

  it('rejects a node whose skeleton lacks the gait bones and lists them', async () => {
    const { h, roomId } = await runner();
    const added = await call(h, 'node.create', { roomId, kind: 'mesh', shape: 'box', name: 'crate' }, roomId);
    expect(added.body.error).toBeUndefined();
    const { body } = await call(h, 'animation.gait', { roomId, nodeId: '@crate', style: 'walk' }, roomId);
    expect(codeOf(body)).toBe('E_INVALID_PARAMS');
    expect(JSON.stringify(body.error)).toContain('UpperLeg_L');
  });
});
