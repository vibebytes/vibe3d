import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobStore } from '../packages/daemon/src/assets/blobstore';
import { createIngest } from '../packages/daemon/src/assets/ingest';
import type { DispatchContext } from '../packages/daemon/src/context';
import { dispatch } from '../packages/daemon/src/dispatch';
import { createLogger } from '../packages/daemon/src/logger';
import { RoomManager, type Template } from '../packages/daemon/src/rooms/manager';
import { AppError } from '../packages/protocol/src/index';

import { fileURLToPath } from 'node:url';
import type { CapabilityName } from '../packages/capabilities/src/index';
import { isVibe3DError } from '../packages/client/src/errors';
import { mockTransport } from '../packages/client/src/mock';
import { RoomHandle } from '../packages/client/src/room';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CASES = join(ROOT, 'fixtures/cases');
const ASSETS = join(ROOT, 'fixtures/assets');

interface Assertion {
  path: string;
  eq?: unknown;
  ne?: unknown;
  len?: number;
  exists?: boolean;
}

interface Step {
  call: string;
  params?: Record<string, unknown>;
  as?: string;
  expect?: { error?: string; assert?: Assertion[] };
}

function deref(value: unknown, refs: Map<string, unknown>): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const dot = value.indexOf('.');
  const key = dot < 0 ? value.slice(1) : value.slice(1, dot);
  const rest = dot < 0 ? '' : value.slice(dot + 1);
  const hit = refs.get(key);
  return rest && hit !== undefined ? pick(hit, rest, refs) : hit;
}

function pick(root: unknown, path: string, refs: Map<string, unknown>): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    cur = deref(cur, refs);
    if (cur === null || typeof cur !== 'object') return undefined;
    const brace = /\{([^}]+)\}/.exec(seg);
    if (brace) {
      const base = (cur as Record<string, unknown>)[seg.slice(0, brace.index)];
      if (base === null || typeof base !== 'object') return undefined;
      cur = (base as Record<string, unknown>)[String(deref(`$${brace[1].replace(':', '.')}`, refs))];
      continue;
    }
    cur = (cur as Record<string, unknown>)[String(seg.startsWith('$') ? deref(seg, refs) : seg)];
  }
  return deref(cur, refs);
}

function expand(value: unknown, refs: Map<string, unknown>): unknown {
  if (typeof value === 'string') return deref(value, refs);
  if (Array.isArray(value)) return value.map((v) => expand(v, refs));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, refs)]));
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function check(assert: Assertion, view: unknown, refs: Map<string, unknown>): string | undefined {
  const got = pick(view, assert.path, refs);
  if ('exists' in assert) {
    const ok = assert.exists ? got !== undefined : got === undefined;
    return ok ? undefined : `${assert.path} exists=${assert.exists} (got ${JSON.stringify(got)})`;
  }
  if ('eq' in assert) {
    const want = deref(assert.eq, refs);
    return same(got, want)
      ? undefined
      : `${assert.path} = ${JSON.stringify(got)} want ${JSON.stringify(want)}`;
  }
  if ('ne' in assert) {
    const want = deref(assert.ne, refs);
    return same(got, want) ? undefined : `${assert.path} should not equal ${JSON.stringify(want)}`;
  }
  if ('len' in assert) {
    const n = Array.isArray(got) ? got.length : got && typeof got === 'object' ? Object.keys(got).length : -1;
    return n === assert.len ? undefined : `${assert.path} len=${n} want ${assert.len}`;
  }
  return `${assert.path} 缺少算子`;
}

function buildContext(): { ctx: DispatchContext; rooms: RoomManager } {
  const blobs = new BlobStore(mkdtempSync(join(tmpdir(), 'vibe3d-contract-')));
  const { ingest, inspect } = createIngest({ blobs });
  const rooms = new RoomManager({ maxRooms: 8, logger: createLogger('error'), onChange: () => {} });
  return { rooms, ctx: { rooms, baseUrl: '', ingest, inspect, selection: () => [] } };
}

async function runCase(file: string, via: 'daemon' | 'client' = 'daemon'): Promise<string[]> {
  const spec = JSON.parse(readFileSync(join(CASES, file), 'utf8')) as {
    name: string;
    template?: Template;
    steps: Step[];
  };
  const { ctx, rooms } = buildContext();
  const room = rooms.create({ template: spec.template ?? 'empty' });
  const handle =
    via === 'client'
      ? new RoomHandle(mockTransport({ dispatch: (m, p) => dispatch(m, p, ctx) }), room.id)
      : undefined;
  const refs = new Map<string, unknown>();
  const fails: string[] = [];

  for (const [i, step] of spec.steps.entries()) {
    const params = expand({ roomId: room.id, ...step.params }, refs) as Record<string, unknown>;
    if (typeof params.src === 'string' && params.src.startsWith('assets/')) {
      params.src = join(ASSETS, params.src.slice('assets/'.length));
    }
    let result: unknown;
    let failure: unknown;
    try {
      result = handle
        ? await handle.invoke(step.call as CapabilityName, params as never)
        : await dispatch(step.call, params, ctx);
    } catch (err) {
      failure = err;
    }
    if (step.as) refs.set(step.as, result);

    const tag = `${spec.name}#${i} ${step.call}`;
    const code =
      failure instanceof AppError
        ? failure.code
        : isVibe3DError(failure)
          ? failure.code
          : failure
            ? 'E_JS'
            : undefined;
    if (step.expect?.error) {
      if (code !== step.expect.error) fails.push(`${tag} 期望 ${step.expect.error}，实际 ${code ?? '成功'}`);
      continue;
    }
    if (failure) {
      fails.push(`${tag} 意外抛错 ${code}: ${(failure as Error).message}`);
      continue;
    }
    const view = {
      doc: rooms.get(room.id).doc,
      node: undefined,
      asset: undefined,
      ...(result as Record<string, unknown>),
    };
    const out = result as { nodeId?: string; sha?: string } | undefined;
    const doc = rooms.get(room.id).doc;
    view.node = out?.nodeId ? doc.nodes[out.nodeId] : undefined;
    view.asset = out?.sha ? doc.assets[out.sha] : undefined;
    for (const assert of step.expect?.assert ?? []) {
      const bad = check(assert, view, refs);
      if (bad) fails.push(`${tag} ${bad}`);
    }
  }
  return fails;
}

const files = readdirSync(CASES)
  .filter((f) => f.endsWith('.json'))
  .sort();
let bad = 0;
for (const file of files) {
  const fails = [
    ...(await runCase(file, 'daemon')),
    ...(await runCase(file, 'client')).map((f) => `[client] ${f}`),
  ];
  if (fails.length === 0) {
    console.log(`ok   ${file}`);
  } else {
    bad += 1;
    console.log(`FAIL ${file}`);
    for (const f of fails) console.log(`     ${f}`);
  }
}
console.log(
  bad === 0
    ? `contract ok (${files.length} cases × 2 transports: daemon dispatch + client RoomHandle/mock)`
    : `contract failed: ${bad}/${files.length}`,
);
process.exit(bad === 0 ? 0 : 1);
