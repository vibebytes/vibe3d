import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';

export function referencedAssets(doc: SceneDoc): Set<string> {
  const seen = new Set<string>();
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === 'model') seen.add(node.sha);
    if (node.kind === 'mesh') {
      const map = doc.materials[node.material]?.map;
      if (map) seen.add(map);
    }
  }
  if (doc.env.hdri) seen.add(doc.env.hdri);
  return seen;
}

export function assertAssetRefs(doc: SceneDoc): void {
  for (const sha of referencedAssets(doc)) {
    if (!doc.assets[sha]) {
      throw new AppError('E_ASSET_MISSING', `引用的资产未登记：${sha}`, { sha });
    }
  }
}
