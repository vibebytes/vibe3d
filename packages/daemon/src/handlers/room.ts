import { AppError, type Op, type SceneDoc } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { assertAssetRefs } from './asset-refs';
import { surfaceHint } from './editor-url';
import type { HandlersFor } from './types';

const EMPTY_SCENE_HINT =
  '场景仍没有任何节点，UI 不会出现新物体：基础体请直接用 vibe3d_create_node；若走 ops.apply，op 必须是 node.create 且 node 带 geometry 与已存在的 material。';

const sceneFeedback = (
  doc: SceneDoc,
  ctx?: { baseUrl: string; token?: string; surfaces?: (roomId: string) => number },
  roomId?: string,
): { nodeCount: number; editors?: number; hint?: string } => {
  const nodeCount = Object.keys(doc.nodes).length;
  const editors = roomId ? (ctx?.surfaces?.(roomId) ?? 0) : undefined;
  const hints = [
    nodeCount === 0 ? EMPTY_SCENE_HINT : undefined,
    roomId && editors === 0 && ctx ? surfaceHint(ctx, roomId) : undefined,
  ].filter((v): v is string => Boolean(v));
  return {
    nodeCount,
    ...(editors === undefined ? {} : { editors }),
    ...(hints.length ? { hint: hints.join(' ') } : {}),
  };
};

type Keys =
  | 'room.create'
  | 'room.list'
  | 'room.get'
  | 'room.close'
  | 'scene.get'
  | 'scene.export'
  | 'scene.import'
  | 'scene.summary'
  | 'ops.apply'
  | 'scene.undo'
  | 'scene.redo'
  | 'scene.diff'
  | 'selection.get';

export const roomHandlers: HandlersFor<Keys> = {
  'room.create': async (p, ctx) => {
    const room = ctx.rooms.create({ name: p.name, template: p.template });
    return {
      roomId: room.id,
      name: room.name,
      url: `${ctx.baseUrl}/editor/r/${room.id}`,
      revision: room.revision,
    };
  },

  'room.list': async (_p, ctx) => ({
    rooms: ctx.rooms.list().map((room) => {
      const meta = room.meta();
      return {
        roomId: meta.roomId,
        name: meta.name,
        revision: meta.revision,
        nodeCount: meta.nodes,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      };
    }),
  }),

  'room.get': async (p, ctx) => {
    const meta = ctx.rooms.get(p.roomId).meta();
    return {
      roomId: meta.roomId,
      name: meta.name,
      revision: meta.revision,
      nodeCount: meta.nodes,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      editors: ctx.surfaces?.(p.roomId) ?? 0,
      url: `${ctx.baseUrl}/editor/r/${p.roomId}`,
    };
  },

  'room.close': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const revision = room.revision;
    ctx.rooms.close(p.roomId, p.purge ?? false);
    return { revision, closed: true };
  },

  'scene.get': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return { revision: room.revision, doc: room.doc };
  },

  'scene.export': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return { revision: room.revision, doc: structuredClone(room.doc) };
  },

  'scene.import': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    assertAssetRefs(p.doc);
    if (p.expectRevision !== undefined && p.expectRevision !== room.revision) {
      throw new AppError('E_CONFLICT', 'revision 冲突', { currentRevision: room.revision });
    }
    const result = await room.run(() =>
      room.apply([{ op: 'scene.replace', doc: p.doc }], { expectRevision: p.expectRevision }),
    );
    return { revision: result.revision };
  },

  'scene.summary': async (p, ctx) => {
    const doc = ctx.rooms.get(p.roomId).doc;
    return {
      revision: doc.revision,
      nodeCount: Object.keys(doc.nodes).length,
      roots: doc.roots,
      materials: Object.keys(doc.materials),
      assets: Object.keys(doc.assets),
      camera: { p: doc.camera.p, target: doc.camera.target, fov: doc.camera.fov },
      stage: doc.stage,
    };
  },

  'ops.apply': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const ops = p.ops as Op[];
    if (p.dryRun) {
      const { doc, inverse, warnings } = applyOps(room.doc, ops);
      return {
        revision: room.revision,
        applied: ops.length,
        warnings,
        inverse,
        ...sceneFeedback(doc, ctx, p.roomId),
      };
    }
    return room.run(async () => {
      const result = await room.apply(ops, { expectRevision: p.baseRevision, opId: p.opId });
      return { ...result, ...sceneFeedback(room.doc, ctx, p.roomId) };
    });
  },

  'scene.undo': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return room.run(async () => {
      const { revision } = await room.undo();
      return { revision };
    });
  },

  'scene.redo': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return room.run(async () => {
      const { revision } = await room.redo();
      return { revision };
    });
  },

  'scene.diff': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const diff = room.diff(p.from ?? 0, p.to);
    return { from: diff.fromRevision, to: diff.toRevision, ops: diff.ops, reset: diff.reset };
  },

  'selection.get': async (p, ctx) => ({ nodeIds: ctx.selection(p.roomId) }),
};
