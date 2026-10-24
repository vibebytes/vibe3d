import {
  AppError,
  type AssetMeta,
  type GltfReport,
  type Op,
  type Transform,
  makeNodeId,
} from '@vibebyte/vibe3d-protocol';
import type { DispatchContext } from '../context';
import type { HandlersFor } from './types';

type Keys = 'node.import' | 'asset.inspect' | 'asset.put' | 'asset.list' | 'asset.delete';

const TARGET_HEIGHT = 1.5;

function refCounts(ctx: DispatchContext, roomId: string): Record<string, number> {
  const doc = ctx.rooms.get(roomId).doc;
  const refs: Record<string, number> = {};
  const bump = (sha: string | undefined) => {
    if (sha) refs[sha] = (refs[sha] ?? 0) + 1;
  };
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === 'model') bump(node.sha);
    if (node.kind === 'mesh') {
      const map = doc.materials[node.material]?.map;
      bump(typeof map === 'string' ? map : map?.sha);
    }
  }
  bump(doc.env.hdri);
  return refs;
}

export const assetHandlers: HandlersFor<Keys> = {
  'node.import': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    let meta: AssetMeta;
    let report: GltfReport;
    if (p.sha) {
      const known = room.doc.assets[p.sha];
      if (!known) throw new AppError('E_ASSET_MISSING', `资产未注册：${p.sha}`, { sha: p.sha });
      if (known.kind !== 'gltf' || !known.gltf) {
        throw new AppError('E_ASSET_TYPE', `资产不是 glTF：${known.name}`, { sha: p.sha });
      }
      meta = known;
      report = known.gltf;
    } else if (p.src) {
      const ingested = await ctx.ingest(p.src, p.policy);
      if (!ingested.report) {
        throw new AppError('E_ASSET_TYPE', `node.import 只接受 glTF：${ingested.meta.name}`);
      }
      meta = ingested.meta;
      report = ingested.report;
    } else {
      throw new AppError('E_INVALID_PARAMS', 'node.import 需要 src 或 sha');
    }
    const id = makeNodeId();

    const [min, max] = [report.size.min, report.size.max];
    const height = max[1] - min[1];
    const k = p.transform?.s ? undefined : height > 0 ? TARGET_HEIGHT / height : 1;
    const transform: Transform = {
      p:
        p.transform?.p ??
        ((k ? [(-(min[0] + max[0]) / 2) * k, -min[1] * k, (-(min[2] + max[2]) / 2) * k] : [0, 0, 0]) as [
          number,
          number,
          number,
        ]),
      r: p.transform?.r ?? [0, 0, 0],
      s: p.transform?.s ?? [k ?? 1, k ?? 1, k ?? 1],
    };

    const result = await room.run(async () => {
      room.registerAsset(meta);
      const ops: Op[] = [
        {
          op: 'node.create',
          node: {
            id,
            kind: 'model',
            name: p.name ?? (meta.name || 'model'),
            parent: p.parent ?? null,
            visible: true,
            transform,
            sha: meta.sha,
          },
        },
      ];
      return room.apply(ops);
    });

    let revision = result.revision;
    const first = report.animations[0];
    if (p.autoplay && first) {
      const played = await room.run(() =>
        room.apply([{ op: 'animation.play', target: id, clip: first.name, speed: 1 }]),
      );
      revision = played.revision;
    }

    return { nodeId: id, sha: meta.sha, revision, report };
  },

  'asset.inspect': async (p, ctx) => {
    const { sha, cached, report } = await ctx.inspect(p.src, p.policy);
    return { sha, cached, report };
  },

  'asset.put': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const { meta } = await ctx.ingest(p.src, p.policy);
    const asset = p.name ? { ...meta, name: p.name } : meta;
    const result = await room.run(() => room.apply([{ op: 'asset.register', asset }]));
    return { sha: asset.sha, meta: asset, revision: result.revision };
  },

  'asset.list': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    return {
      assets: Object.values(room.doc.assets),
      refs: refCounts(ctx, room.id),
    };
  },

  'asset.delete': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    if (!room.doc.assets[p.sha]) throw new AppError('E_ASSET_MISSING', `资产未注册：${p.sha}`);
    const used = refCounts(ctx, room.id)[p.sha] ?? 0;
    if (used > 0) {
      throw new AppError('E_ASSET_IN_USE', `资产仍被 ${used} 处引用`, { sha: p.sha, refs: used });
    }
    const result = await room.run(() => room.apply([{ op: 'asset.unregister', sha: p.sha }]));
    return { revision: result.revision };
  },
};
