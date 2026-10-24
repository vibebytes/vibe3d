import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { mergeSubtrees } from '@vibebyte/vibe3d-scene';
import { listCheckpoints, readCheckpoint, saveCheckpoint } from '../rooms/checkpoints';
import { assertAssetRefs } from './asset-refs';
import type { HandlersFor } from './types';

type Keys = 'scene.checkpoint' | 'scene.checkpoints' | 'scene.restore';

export const checkpointHandlers: HandlersFor<Keys> = {
  'scene.checkpoint': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const meta = saveCheckpoint(ctx.rooms.persistDir, p.roomId, room.doc, p.name);
    return { checkpointId: meta.id, revision: meta.revision };
  },

  'scene.checkpoints': async (p, ctx) => {
    ctx.rooms.get(p.roomId);
    const items = listCheckpoints(ctx.rooms.persistDir, p.roomId);
    return { items };
  },

  'scene.restore': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const checkpoint = readCheckpoint(ctx.rooms.persistDir, p.roomId, p.checkpointId);
    const snapshot = checkpoint.doc as SceneDoc;
    assertAssetRefs(snapshot);

    if (p.scope === 'subtree') {
      const ids = p.ids ?? [];
      if (ids.length === 0) {
        throw new AppError('E_INVALID_PARAMS', 'scope=subtree 需要非空 ids');
      }
      const missing = ids.filter((id) => !snapshot.nodes[id]);
      if (missing.length > 0) {
        throw new AppError('E_NODE_NOT_FOUND', `快照中不存在节点：${missing.join(', ')}`, {
          missing,
        });
      }
      saveCheckpoint(ctx.rooms.persistDir, p.roomId, room.doc, 'auto-before-restore');
      const merged = mergeSubtrees(room.doc, snapshot, ids);
      assertAssetRefs(merged.doc);
      const result = await room.run(() => room.apply([{ op: 'scene.replace', doc: merged.doc }]));
      return {
        revision: result.revision,
        scope: 'subtree' as const,
        restored: merged.restored,
        added: merged.added,
      };
    }

    saveCheckpoint(ctx.rooms.persistDir, p.roomId, room.doc, 'auto-before-restore');
    const result = await room.run(() => room.apply([{ op: 'scene.replace', doc: snapshot }]));
    return {
      revision: result.revision,
      scope: 'room' as const,
      restored: [] as string[],
      added: [] as string[],
    };
  },
};
