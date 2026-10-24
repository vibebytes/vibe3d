import { describe, expect, it } from 'vitest';
import { call, makeHarness } from './helpers/harness';

const codeOf = (body: any): string => body?.error?.data?.code ?? body?.error?.code;

async function room() {
  const h = makeHarness();
  const { body } = await call(h, 'room.create', { name: 'tags' });
  return { h, roomId: body.result.roomId as string };
}

describe('node tags', () => {
  it('node.create stores tags and node.get returns them', async () => {
    const { h, roomId } = await room();
    const created = await call(h, 'node.create', { roomId, kind: 'group', name: 'chair', tags: ['a', 'b'] }, roomId);
    const id = created.body.result.nodeId;
    expect(created.body.result.tags).toEqual(['a', 'b']);
    const got = await call(h, 'node.get', { roomId, nodeId: id }, roomId);
    expect(got.body.result.tags).toEqual(['a', 'b']);
  });

  it('node.update replaces tags and null clears them', async () => {
    const { h, roomId } = await room();
    const created = await call(h, 'node.create', { roomId, kind: 'group', tags: ['a'] }, roomId);
    const nodeId = created.body.result.nodeId;
    await call(h, 'node.update', { roomId, nodeId, patch: { tags: ['b', 'c'] } }, roomId);
    const replaced = await call(h, 'node.get', { roomId, nodeId }, roomId);
    expect(replaced.body.result.tags).toEqual(['b', 'c']);
    await call(h, 'node.update', { roomId, nodeId, patch: { tags: null } }, roomId);
    const cleared = await call(h, 'node.get', { roomId, nodeId }, roomId);
    expect(cleared.body.result.tags).toBeUndefined();
  });

  it('scene.query filters by tags with AND semantics and returns tags on briefs', async () => {
    const { h, roomId } = await room();
    await call(h, 'node.create', { roomId, kind: 'group', name: 'both', tags: ['a', 'b'] }, roomId);
    await call(h, 'node.create', { roomId, kind: 'group', name: 'only-a', tags: ['a'] }, roomId);
    await call(h, 'node.create', { roomId, kind: 'group', name: 'none' }, roomId);
    const both = await call(h, 'scene.query', { roomId, tags: ['a', 'b'] }, roomId);
    expect(both.body.result.nodes.map((n: any) => n.name)).toEqual(['both']);
    expect(both.body.result.nodes[0].tags).toEqual(['a', 'b']);
    const anyA = await call(h, 'scene.query', { roomId, tags: ['a'] }, roomId);
    expect(anyA.body.result.nodes.map((n: any) => n.name).sort()).toEqual(['both', 'only-a']);
  });

  it('omitting tags keeps the payload unchanged', async () => {
    const { h, roomId } = await room();
    const created = await call(h, 'node.create', { roomId, kind: 'group' }, roomId);
    expect(created.body.result.tags).toBeUndefined();
    const got = await call(h, 'node.get', { roomId, nodeId: created.body.result.nodeId }, roomId);
    expect(got.body.result.tags).toBeUndefined();
  });

  it('rejects empty, oversized or too many tags with E_INVALID_PARAMS and creates nothing', async () => {
    const { h, roomId } = await room();
    const empty = await call(h, 'node.create', { roomId, kind: 'group', tags: [''] }, roomId);
    expect(codeOf(empty.body)).toBe('E_INVALID_PARAMS');
    const tooLong = await call(h, 'node.create', { roomId, kind: 'group', tags: ['x'.repeat(33)] }, roomId);
    expect(codeOf(tooLong.body)).toBe('E_INVALID_PARAMS');
    const tooMany = await call(h, 'node.create', {
      roomId,
      kind: 'group',
      tags: Array.from({ length: 17 }, (_, i) => `t${i}`),
    }, roomId);
    expect(codeOf(tooMany.body)).toBe('E_INVALID_PARAMS');
    const all = await call(h, 'scene.query', { roomId }, roomId);
    expect(all.body.result.total).toBe(0);
  });
});
