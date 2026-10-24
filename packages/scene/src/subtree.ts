import type { SceneDoc } from '@vibebyte/vibe3d-protocol';

export function subtreeIds(doc: Pick<SceneDoc, 'nodes'>, rootId: string): string[] {
  const kids = new Map<string, string[]>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!node.parent) continue;
    const list = kids.get(node.parent);
    if (list) list.push(id);
    else kids.set(node.parent, [id]);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const child of kids.get(id) ?? []) queue.push(child);
  }
  return out;
}
