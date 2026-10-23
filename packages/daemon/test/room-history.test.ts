import { type RoomId, type SceneNode, emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { type ChangeInfo, Room } from '../src/rooms/room';

const ROOM = 'r_hist0001' as RoomId;

const mkRoom = (onChange?: (room: Room, change: ChangeInfo) => void) =>
  new Room(emptyDoc(), ROOM, { onChange });

const mkCreate = (id: string) =>
  ({
    op: 'node.create' as const,
    node: {
      id,
      name: id,
      parent: null,
      visible: true,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      kind: 'group' as const,
    } satisfies SceneNode,
  }) as const;

describe('Room 历史语义', () => {
  it('diff 区间连续时 reset=false，undo 后缺口标 reset=true 且 ops 为空', async () => {
    const room = mkRoom();
    await room.apply([mkCreate('n1')]);
    const before = room.diff(0);
    expect(before).toMatchObject({ fromRevision: 0, toRevision: 1, reset: false });
    expect(before.ops).toHaveLength(1);
    await room.undo();
    const after = room.diff(0);
    expect(after.reset).toBe(true);
    expect(after.ops).toEqual([]);
    expect(after.toRevision).toBe(2);
  });

  it('diff 支持 to 截断区间并钳到当前 revision', async () => {
    const room = mkRoom();
    await room.apply([mkCreate('n1')]);
    await room.apply([mkCreate('n2')]);
    const partial = room.diff(0, 1);
    expect(partial).toMatchObject({ fromRevision: 0, toRevision: 1, reset: false });
    expect((partial.ops[0] as { node: { id: string } }).node.id).toBe('n1');
    const clamped = room.diff(0, 99);
    expect(clamped).toMatchObject({ fromRevision: 0, toRevision: 2, reset: false });
    expect(clamped.ops).toHaveLength(2);
  });

  it('undo 后同一 opId 重试会重新应用而不是命中缓存', async () => {
    const room = mkRoom();
    const first = await room.apply([mkCreate('n1')], { opId: 'op-1' });
    await room.undo();
    const retried = await room.apply([mkCreate('n1')], { opId: 'op-1' });
    expect(retried.revision).toBe(first.revision + 2);
    expect(Object.keys(room.doc.nodes)).toContain('n1');
  });

  it('undo(steps) 与 redo(steps) 的 revision 按 undone/redone 递增', async () => {
    const room = mkRoom();
    await room.apply([mkCreate('n1')]);
    await room.apply([mkCreate('n2')]);
    await room.apply([mkCreate('n3')]);
    const undone = await room.undo(2);
    expect(undone).toMatchObject({ undone: 2, revision: 5 });
    const redone = await room.redo(2);
    expect(redone).toMatchObject({ redone: 2, revision: 7 });
  });

  it('onChange 上报 ops/undo/assets 三类变更，undo 与 assets 不携带 ops', async () => {
    const events: ChangeInfo[] = [];
    const room = mkRoom((_room, change) => events.push(change));
    await room.apply([mkCreate('n1')]);
    await room.undo();
    room.registerAsset({
      kind: 'gltf',
      sha: 'a'.repeat(64),
      bytes: 1,
      name: 'a.glb',
      mime: 'model/gltf-binary',
    });
    expect(events.map((e) => e.kind)).toEqual(['ops', 'undo', 'assets']);
    expect(events[0]!.ops).toHaveLength(1);
    expect(events[1]!.ops).toEqual([]);
    expect(events[2]!.ops).toEqual([]);
  });
});
