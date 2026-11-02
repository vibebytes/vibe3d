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

  it('replaces the pose and an earlier gait but keeps clips without bone tracks', async () => {
    const { h, roomId, nodeId } = await runner();
    const spin = { type: 'spin', frequency: 0.2 };
    expect(
      (await call(h, 'animation.define', { roomId, nodeId, clip: spin }, roomId)).body.error,
    ).toBeUndefined();
    await call(h, 'animation.gait', { roomId, nodeId, style: 'walk' }, roomId);
    await call(h, 'animation.gait', { roomId, nodeId, style: 'run' }, roomId);
    const view = await call(h, 'node.get', { roomId, nodeId }, roomId);
    const clips = view.body.result.clips as any[];
    expect(clips.filter((c) => c.type === 'spin')).toHaveLength(1);
    const boned = clips.filter((c) => (c.tracks ?? []).some((t: any) => t.path.startsWith('bone.')));
    expect(boned).toHaveLength(1);
    expect(boned[0].drift[2]).toBeGreaterThan(2);
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
