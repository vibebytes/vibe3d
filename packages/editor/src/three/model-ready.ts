import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';

function topLevel(node: SceneNode, doc: SceneDoc): string {
  let current = node;
  while (current.parent) {
    const parent = doc.nodes[current.parent];
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

export function missingModelIds(
  doc: SceneDoc | null | undefined,
  present: ReadonlySet<string>,
  selected?: readonly string[] | null,
): string[] {
  if (!doc) return [];
  const wanted = selected?.length ? new Set(selected) : null;
  const missing: string[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (node.kind !== 'model' || !node.visible) continue;
    if (present.has(node.id)) continue;
    if (wanted && !wanted.has(topLevel(node, doc))) continue;
    missing.push(node.id);
  }
  return missing;
}
