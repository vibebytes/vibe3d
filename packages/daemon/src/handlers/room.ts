import { AppError, type Op, type SceneDoc, makeNodeId } from '@vibebyte/vibe3d-protocol';
import { applyOps } from '@vibebyte/vibe3d-scene';
import { thumbUrl } from '../thumbs';
import { assertAssetRefs } from './asset-refs';
import { surfaceHint } from './editor-url';
import type { HandlersFor } from './types';

const EMPTY_SCENE_HINT =
  '场景仍没有任何节点，UI 不会出现新物体：基础体请直接用 vibe3d_create_node；若走 ops.apply，op 必须是 node.create 且 node 带 geometry 与已存在的 material。';

type ListCursor = { updatedAt: string; roomId: string };

const warmRoom = (
  renderer: { ready: boolean; warm?: (roomId: string) => Promise<void> } | undefined,
  roomId: string,
): void => {
  if (!renderer?.ready) return;
  void renderer.warm?.(roomId);
};

const compareRoom = (a: ListCursor, b: ListCursor): number =>
  a.updatedAt === b.updatedAt ? a.roomId.localeCompare(b.roomId) : a.updatedAt > b.updatedAt ? -1 : 1;

const encodeCursor = (c: ListCursor): string =>
  Buffer.from(`${c.updatedAt}|${c.roomId}`).toString('base64url');

const decodeCursor = (raw: string): ListCursor => {
  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const sep = text.lastIndexOf('|');
    const updatedAt = text.slice(0, sep);
    const roomId = text.slice(sep + 1);
    if (sep > 0 && /^\d{4}-\d{2}-\d{2}T/.test(updatedAt) && /^r_[a-z0-9]{8}$/.test(roomId)) {
      return { updatedAt, roomId };
    }
  }
  throw new AppError('E_INVALID_PARAMS', `cursor 非法：${raw}（请使用上一次 room.list 返回的 nextCursor）`);
};

type NodeSets = { added: string[]; updated: string[]; removed: string[] };

const nodeIdOf = (op: Op): string | undefined => {
  if (!op.op.startsWith('node.')) return undefined;
  const loose = op as unknown as { node?: { id?: string }; id?: string };
  return loose.node?.id ?? loose.id;
};

const nodeSets = (ops: readonly Op[]): NodeSets => {
  const added = new Set<string>();
  const updated = new Set<string>();
  const removed = new Set<string>();
  for (const op of ops) {
    const id = nodeIdOf(op);
    if (!id) continue;
    if (op.op === 'node.create') added.add(id);
    else if (op.op === 'node.delete') removed.add(id);
    else updated.add(id);
  }
  return {
    added: [...added],
    updated: [...updated].filter((id) => !removed.has(id)),
    removed: [...removed].filter((id) => !added.has(id)),
  };
};

type AssignedId = { index: number; name: string; id: string };

const assignNodeIds = (ops: readonly Op[]): { ops: Op[]; assigned: AssignedId[] } => {
  const assigned: AssignedId[] = [];
  const out = ops.map((op, index) => {
    if (op.op !== 'node.create' || op.node.id) return op;
    const id = makeNodeId();
    assigned.push({ index, name: op.node.name, id });
    return { ...op, node: { ...op.node, id } } as Op;
  });
  return { ops: out, assigned };
};

const isRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith('@');

const nameTable = (doc: SceneDoc): Map<string, Set<string>> => {
  const table = new Map<string, Set<string>>();
  for (const node of Object.values(doc.nodes)) {
    const ids = table.get(node.name) ?? new Set<string>();
    ids.add(node.id);
    table.set(node.name, ids);
  }
  return table;
};

const resolveNodeRefs = (
  doc: SceneDoc,
  ops: readonly Op[],
): { ops: Op[]; resolved: Record<string, string> } => {
  const table = nameTable(doc);
  const resolved: Record<string, string> = {};
  const resolve = (ref: string): string => {
    const name = ref.slice(1);
    const ids = table.get(name);
    if (!ids || ids.size === 0) {
      throw new AppError('E_NODE_NOT_FOUND', `找不到名为「${name}」的节点：${ref}`, {
        hint: '先用 scene.query 或 node.query 确认节点名，或直接传 node id',
      });
    }
    if (ids.size > 1) {
      throw new AppError('E_INVALID_PARAMS', `节点名「${name}」同名 ${ids.size} 个，${ref} 无法定位`, {
        hint: '请改用 node id 引用（scene.query 可按 name 查到全部 id）',
      });
    }
    const id = [...ids][0] as string;
    resolved[ref] = id;
    return id;
  };
  const take = (v: unknown): unknown => (isRef(v) ? resolve(v) : v);
  const out = ops.map((op) => {
    let next: Op = op;
    if (op.op === 'node.create') {
      next = { ...op, node: { ...op.node, parent: take(op.node.parent) as string | null } } as Op;
      const id = op.node.id;
      if (id) {
        const ids = table.get(op.node.name) ?? new Set<string>();
        ids.add(id);
        table.set(op.node.name, ids);
      }
    } else if (op.op === 'node.update' || op.op === 'node.delete') {
      next = { ...op, id: take(op.id) as string } as Op;
    } else if (op.op === 'node.reparent') {
      next = { ...op, id: take(op.id) as string, parent: take(op.parent) as string | null } as Op;
    }
    return next;
  });
  return { ops: out, resolved };
};

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
  | 'room.use'
  | 'room.get'
  | 'room.close'
  | 'room.timeline'
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

  'room.list': async (p, ctx) => {
    const limit = p.limit ?? 50;
    const all = ctx.rooms
      .list()
      .map((room) => {
        ctx.thumbs?.ensure(ctx, room);
        const meta = room.meta();
        const thumb = ctx.thumbs?.latest(room.id);
        return { meta, thumbUrl: thumb ? thumbUrl(ctx.baseUrl, room.id, thumb) : undefined };
      })
      .sort((a, b) => compareRoom(a.meta, b.meta));
    const start = p.cursor ? decodeCursor(p.cursor) : undefined;
    const rest = start ? all.filter((m) => compareRoom(m.meta, start) > 0) : all;
    const page = rest.slice(0, limit);
    const last = page.at(-1)?.meta;
    const nextCursor = last && rest.length > page.length ? encodeCursor(last) : undefined;
    return {
      rooms: page.map(({ meta, thumbUrl: url }) => ({
        roomId: meta.roomId,
        name: meta.name,
        revision: meta.revision,
        nodeCount: meta.nodes,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        ...(url ? { thumbUrl: url } : {}),
      })),
      ...(nextCursor ? { nextCursor } : {}),
    };
  },

  'room.use': async (p, ctx) => {
    const meta = ctx.rooms.get(p.roomId).meta();
    warmRoom(ctx.renderer, meta.roomId);
    return {
      roomId: meta.roomId,
      name: meta.name,
      revision: meta.revision,
      nodeCount: meta.nodes,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  },

  'room.get': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const meta = room.meta();
    warmRoom(ctx.renderer, room.id);
    ctx.thumbs?.ensure(ctx, room);
    const thumb = ctx.thumbs?.latest(room.id);
    return {
      roomId: meta.roomId,
      name: meta.name,
      revision: meta.revision,
      nodeCount: meta.nodes,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      editors: ctx.surfaces?.(p.roomId) ?? 0,
      url: `${ctx.baseUrl}/editor/r/${p.roomId}`,
      ...(thumb ? { thumbUrl: thumbUrl(ctx.baseUrl, room.id, thumb) } : {}),
    };
  },

  'room.close': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const revision = room.revision;
    ctx.rooms.close(p.roomId, p.purge ?? false);
    void ctx.renderer?.drop?.(p.roomId);
    return { revision, closed: true };
  },

  'room.timeline': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return { revision: room.revision, entries: room.timeline(p.limit ?? 20) };
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
      throw room.conflict(p.expectRevision);
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
    const { ops: withIds, assigned } = assignNodeIds(p.ops as Op[]);
    const { ops, resolved } = resolveNodeRefs(room.doc, withIds);
    const extra = {
      ...(assigned.length ? { assigned } : {}),
      ...(Object.keys(resolved).length ? { resolved } : {}),
    };
    if (p.dryRun) {
      const { doc, inverse, warnings, summary } = applyOps(room.doc, ops);
      return {
        revision: room.revision,
        applied: ops.length,
        warnings,
        inverse,
        summary,
        ...extra,
        ...sceneFeedback(doc, ctx, p.roomId),
      };
    }
    return room.run(async () => {
      const result = await room.apply(ops, { expectRevision: p.baseRevision, opId: p.opId });
      return { ...result, ...extra, ...sceneFeedback(room.doc, ctx, p.roomId) };
    });
  },

  'scene.undo': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return room.run(async () => {
      const { revision } = p.opId ? await room.undoOp(p.opId) : await room.undo();
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
    return {
      from: diff.fromRevision,
      to: diff.toRevision,
      ops: diff.ops,
      reset: diff.reset,
      authors: diff.authors,
      ...(p.visual ? { nodes: nodeSets(diff.ops) } : {}),
    };
  },

  'selection.get': async (p, ctx) => ({ nodeIds: ctx.selection(p.roomId) }),
};
