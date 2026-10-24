import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';

export interface Limits {
  maxNodes: number;
  maxDepth: number;
}

export const DEFAULT_LIMITS: Limits = { maxNodes: 20_000, maxDepth: 32 };

function fail(
  message: string,
  data?: Record<string, unknown>,
  code: 'E_INVALID_PARAMS' | 'E_ASSET_TYPE' = 'E_INVALID_PARAMS',
): never {
  throw new AppError(code, message, data);
}

const finiteVec = (v: readonly number[]): boolean => v.every((n) => Number.isFinite(n));

export function validateDoc(doc: SceneDoc, limits: Limits = DEFAULT_LIMITS): void {
  if (doc.schemaVersion !== 1) fail('schemaVersion 必须为 1');
  const ids = Object.keys(doc.nodes);
  if (ids.length > limits.maxNodes) fail(`节点数 ${ids.length} 超过上限 ${limits.maxNodes}`);

  for (const [key, node] of Object.entries(doc.nodes)) {
    if (key !== node.id) fail('nodes 的 key 与 node.id 不一致', { key, id: node.id });
    if (!node.name) fail('节点名不能为空', { id: key });
    if (!finiteVec(node.transform.p) || !finiteVec(node.transform.r))
      fail('transform 含非有限值', { id: key });
    if (!finiteVec(node.transform.s) || node.transform.s.some((v) => v === 0)) {
      fail('scale 三轴必须非零', { id: key });
    }
    if (node.parent !== null && !doc.nodes[node.parent])
      fail('父节点不存在', { id: key, parent: node.parent });
    if (node.kind === 'mesh') {
      const material = doc.materials[node.material];
      if (!material) fail('材质引用不存在', { id: key, material: node.material });
      if (material.map) {
        const asset = doc.assets[material.map];
        if (!asset || asset.kind !== 'image' || asset.image?.hdri) {
          fail('材质贴图必须是普通图片资产', { id: key, sha: material.map }, 'E_ASSET_TYPE');
        }
      }
    }
    if (node.kind === 'model') {
      const asset = doc.assets[node.sha];
      if (!asset || asset.kind !== 'gltf') fail('模型资产不存在或不是 gltf', { id: key, sha: node.sha });
      const clip = node.anim?.clip;
      if (clip && !asset.gltf?.animations.some((a) => a.name === clip)) {
        fail('动画 clip 不在资产报告里', { id: key, clip });
      }
      if (clip && (asset.gltf?.skins ?? 0) === 0) fail('资产没有蒙皮，不能播放动画', { id: key, clip });
    }
  }

  if (doc.env.hdri) {
    const asset = doc.assets[doc.env.hdri];
    if (!asset || asset.kind !== 'image' || !asset.image?.hdri) {
      fail('环境贴图必须是 HDRI 资产', { sha: doc.env.hdri }, 'E_ASSET_TYPE');
    }
  }

  const seenRoots = new Set<string>();
  for (const id of doc.roots) {
    if (seenRoots.has(id)) fail('roots 存在重复', { id });
    seenRoots.add(id);
    const node = doc.nodes[id];
    if (!node) fail('roots 引用了不存在的节点', { id });
    if (node.parent !== null) fail('roots 中的节点 parent 必须为 null', { id });
  }
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.parent === null && !seenRoots.has(id)) fail('根节点未登记在 roots', { id });
  }

  const children = new Map<string, string[]>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.parent === null) continue;
    const list = children.get(node.parent);
    if (list) list.push(id);
    else children.set(node.parent, [id]);
  }

  const color = new Map<string, 1 | 2>();
  for (const root of doc.roots) {
    if (color.get(root) === 2) continue;
    const stack: { id: string; depth: number; exit?: boolean }[] = [{ id: root, depth: 1 }];
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item.exit) {
        color.set(item.id, 2);
        continue;
      }
      const state = color.get(item.id);
      if (state === 1) fail('场景图存在环', { id: item.id });
      if (state === 2) fail('节点存在多个父级或重复入树', { id: item.id });
      if (item.depth > limits.maxDepth) fail(`深度超过上限 ${limits.maxDepth}`, { id: item.id });
      color.set(item.id, 1);
      stack.push({ id: item.id, depth: item.depth, exit: true });
      for (const childId of children.get(item.id) ?? []) {
        stack.push({ id: childId, depth: item.depth + 1 });
      }
    }
  }
  for (const id of Object.keys(doc.nodes)) {
    if (!color.has(id)) fail('节点不在任何根下（孤儿或环）', { id });
  }
}
