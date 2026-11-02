export interface ImagePayload {
  path: (string | number)[];
  base64: string;
  mime: string;
  label?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 递归找出 `{base64, mime}` 图片载荷，path 指向它所在的对象。 */
export function imagePayloads(value: unknown): ImagePayload[] {
  const found: ImagePayload[] = [];
  const walk = (node: unknown, path: (string | number)[], depth: number) => {
    if (depth > 6 || (!isRecord(node) && !Array.isArray(node))) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, index], depth + 1));
      return;
    }
    if (typeof node.base64 === 'string' && typeof node.mime === 'string' && node.mime.startsWith('image/')) {
      const label =
        typeof node.view === 'string' ? node.view : typeof node.label === 'string' ? node.label : undefined;
      found.push({ path, base64: node.base64, mime: node.mime, ...(label ? { label } : {}) });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'base64') continue;
      walk(child, [...path, key], depth + 1);
    }
  };
  walk(value, [], 0);
  return found;
}
