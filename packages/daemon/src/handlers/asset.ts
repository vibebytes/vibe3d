import { type Op, type Transform, makeNodeId } from '@vibebyte/vibe3d-protocol';
import type { HandlersFor } from './types';

type Keys = 'node.import' | 'asset.inspect';

const TARGET_HEIGHT = 1.5;

export const assetHandlers: HandlersFor<Keys> = {
  'node.import': async (p, ctx) => {
    const room = ctx.rooms.get(p.roomId);
    const { meta, report } = await ctx.ingest(p.src, p.policy);
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
};
