import type { SceneDoc } from '@vibebyte/vibe3d-protocol';

export interface ChangedPaths {
  paths: string[];
  truncated: boolean;
}

export interface ChangedPathOptions {
  limit?: number;
}

const IGNORED = new Set(['revision', 'updatedAt']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function walk(a: unknown, b: unknown, path: string, out: string[]): void {
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (!deepEqual(a, b) && path) out.push(path);
    return;
  }
  if (!isRecord(a) || !isRecord(b)) {
    if (path) out.push(path);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!path && IGNORED.has(key)) continue;
    const va = a[key];
    const vb = b[key];
    if (va === undefined && vb === undefined) continue;
    const child = path ? `${path}/${key}` : `/${key}`;
    if (va === undefined || vb === undefined) {
      out.push(child);
      continue;
    }
    walk(va, vb, child, out);
  }
}

export function changedPaths(before: SceneDoc, after: SceneDoc, opts: ChangedPathOptions = {}): ChangedPaths {
  const limit = opts.limit ?? 32;
  const paths: string[] = [];
  walk(before, after, '', paths);
  paths.sort();
  if (paths.length <= limit) return { paths, truncated: false };
  return { paths: paths.slice(0, limit), truncated: true };
}
