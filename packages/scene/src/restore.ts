import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { subtreeIds } from './subtree';

export interface MergeSubtreesResult {
  doc: SceneDoc;
  restored: string[];
  added: string[];
}

function isUnder(doc: SceneDoc, id: string, rootId: string): boolean {
  let cursor = doc.nodes[id]?.parent ?? null;
  while (cursor) {
    if (cursor === rootId) return true;
    cursor = doc.nodes[cursor]?.parent ?? null;
  }
  return false;
}

function refsOf(node: SceneNode): { materials: string[]; assets: string[] } {
  if (node.kind === 'mesh') {
    return {
      materials: [node.material],
      assets: node.decal?.imageSha ? [node.decal.imageSha] : [],
    };
  }
  if (node.kind === 'model') return { materials: [], assets: [node.sha] };
  return { materials: [], assets: [] };
}

export function mergeSubtrees(
  current: SceneDoc,
  snapshot: SceneDoc,
  ids: readonly string[],
): MergeSubtreesResult {
  const nodes: Record<string, SceneNode> = { ...current.nodes };
  const materials = { ...current.materials };
  const assets = { ...current.assets };
  const roots = ids.filter((id) => !ids.some((other) => other !== id && isUnder(snapshot, id, other)));
  const restored: string[] = [];
  const added: string[] = [];

  for (const id of roots) {
    const source = snapshot.nodes[id];
    if (!source) continue;
    const existed = current.nodes[id] !== undefined;
    const parent = source.parent && nodes[source.parent] ? source.parent : null;
    if (existed) {
      for (const old of subtreeIds(current, id)) delete nodes[old];
    }
    for (const sid of subtreeIds(snapshot, id)) {
      const node = snapshot.nodes[sid];
      if (!node) continue;
      nodes[sid] = { ...node, parent: sid === id ? parent : node.parent };
      const refs = refsOf(node);
      for (const materialId of refs.materials) {
        const material = snapshot.materials[materialId];
        if (!material) continue;
        materials[materialId] = material;
        const mapSha = typeof material.map === 'string' ? material.map : material.map?.sha;
        if (mapSha && snapshot.assets[mapSha]) assets[mapSha] = snapshot.assets[mapSha];
      }
      for (const assetSha of refs.assets) {
        if (snapshot.assets[assetSha]) assets[assetSha] = snapshot.assets[assetSha];
      }
    }
    if (existed) restored.push(id);
    else added.push(id);
  }

  const nextRoots = current.roots.filter((id) => nodes[id] && nodes[id].parent === null);
  for (const id of [...restored, ...added]) {
    if (nodes[id]?.parent === null && !nextRoots.includes(id)) nextRoots.push(id);
  }
  return { doc: { ...current, nodes, materials, assets, roots: nextRoots }, restored, added };
}
