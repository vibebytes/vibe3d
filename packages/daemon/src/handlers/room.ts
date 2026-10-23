import type { Op } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import type { HandlersFor } from './types';

type Keys =
  | 'room.create'
  | 'room.list'
  | 'room.get'
  | 'room.close'
  | 'scene.get'
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
      url: `${ctx.baseUrl}/r/${room.id}`,
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
      const { inverse, warnings } = applyOps(room.doc, ops);
      return { revision: room.revision, applied: ops.length, warnings, inverse };
    }
    return room.run(() => room.apply(ops, { expectRevision: p.baseRevision, opId: p.opId }));
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
