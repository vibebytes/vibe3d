import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';

export const isRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith('@');

export const nameTable = (doc: SceneDoc): Map<string, Set<string>> => {
  const table = new Map<string, Set<string>>();
  for (const node of Object.values(doc.nodes)) {
    const ids = table.get(node.name) ?? new Set<string>();
    ids.add(node.id);
    table.set(node.name, ids);
  }
  return table;
};

export const refInTable = (table: Map<string, Set<string>>, ref: string): string => {
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
  return [...ids][0] as string;
};

/** Node id for an id or `@name` ref; plain ids pass through unchecked. */
export const nodeIdOf = (doc: SceneDoc, ref: string): string =>
  isRef(ref) ? refInTable(nameTable(doc), ref) : ref;
