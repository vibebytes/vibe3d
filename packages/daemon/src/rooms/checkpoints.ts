import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, type SceneDoc } from '@vibebyte/vibe3d-protocol';

export interface CheckpointMeta {
  id: string;
  revision: number;
  name?: string;
  bytes: number;
  createdAt: string;
}

interface CheckpointFile extends CheckpointMeta {
  doc: SceneDoc;
}

export const MAX_CHECKPOINTS = 50;

const memory = new Map<string, CheckpointFile[]>();
let seq = 0;

function dirOf(persistDir: string | undefined, roomId: string): string | undefined {
  return persistDir ? join(persistDir, roomId, 'checkpoints') : undefined;
}

function nextId(): { id: string; createdAt: string } {
  const ms = Date.now();
  seq = (seq + 1) % 10_000;
  return { id: `ck_${String(ms)}${String(seq).padStart(4, '0')}`, createdAt: new Date(ms).toISOString() };
}

function readOne(dir: string, file: string): CheckpointFile | null {
  const path = join(dir, file);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CheckpointFile;
    return { ...parsed, bytes: statSync(path).size };
  } catch {
    return null;
  }
}

function readAll(persistDir: string | undefined, roomId: string): CheckpointFile[] {
  const dir = dirOf(persistDir, roomId);
  if (!dir) return memory.get(roomId) ?? [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith('ck_') && f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => readOne(dir, file)).filter((item): item is CheckpointFile => item !== null);
}

export function listCheckpoints(persistDir: string | undefined, roomId: string): CheckpointMeta[] {
  return readAll(persistDir, roomId)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, MAX_CHECKPOINTS)
    .map(({ doc: _doc, ...meta }) => meta);
}

export function saveCheckpoint(
  persistDir: string | undefined,
  roomId: string,
  doc: SceneDoc,
  name?: string,
): CheckpointMeta {
  const { id, createdAt } = nextId();
  const body: CheckpointFile = { id, revision: doc.revision, name, bytes: 0, createdAt, doc };
  const text = JSON.stringify(body);
  const dir = dirOf(persistDir, roomId);
  let bytes = Buffer.byteLength(text);
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}.json`);
    writeFileSync(path, text);
    bytes = statSync(path).size;
  } else {
    const items = memory.get(roomId) ?? [];
    items.push({ ...body, bytes });
    memory.set(roomId, items);
  }
  prune(persistDir, roomId);
  return { id, revision: body.revision, name, bytes, createdAt };
}

function prune(persistDir: string | undefined, roomId: string): void {
  const items = readAll(persistDir, roomId).sort((a, b) => (a.id < b.id ? 1 : -1));
  const stale = items.slice(MAX_CHECKPOINTS);
  if (!stale.length) return;
  const dir = dirOf(persistDir, roomId);
  if (!dir) {
    const keep = new Set(items.slice(0, MAX_CHECKPOINTS).map((i) => i.id));
    memory.set(
      roomId,
      (memory.get(roomId) ?? []).filter((i) => keep.has(i.id)),
    );
    return;
  }
  for (const item of stale) {
    rmSync(join(dir, `${item.id}.json`), { force: true });
  }
}

export function readCheckpoint(
  persistDir: string | undefined,
  roomId: string,
  checkpointId: string,
): CheckpointFile {
  if (!/^ck_[0-9A-Za-z_-]+$/.test(checkpointId)) {
    throw new AppError('E_CHECKPOINT_NOT_FOUND', `检查点不存在：${checkpointId}`, {
      checkpointId,
    });
  }
  const dir = dirOf(persistDir, roomId);
  if (dir) {
    const path = join(dir, `${checkpointId}.json`);
    if (!existsSync(path)) {
      throw new AppError('E_CHECKPOINT_NOT_FOUND', `检查点不存在：${checkpointId}`, {
        checkpointId,
      });
    }
    return JSON.parse(readFileSync(path, 'utf8')) as CheckpointFile;
  }
  const hit = (memory.get(roomId) ?? []).find((i) => i.id === checkpointId);
  if (!hit) {
    throw new AppError('E_CHECKPOINT_NOT_FOUND', `检查点不存在：${checkpointId}`, { checkpointId });
  }
  return hit;
}
