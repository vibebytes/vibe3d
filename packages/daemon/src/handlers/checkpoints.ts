import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
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
    const doc = checkpoint.doc as SceneDoc;
    assertAssetRefs(doc);
    saveCheckpoint(ctx.rooms.persistDir, p.roomId, room.doc, 'auto-before-restore');
    const result = await room.run(() => room.apply([{ op: 'scene.replace', doc }]));
    return { revision: result.revision };
  },
};
