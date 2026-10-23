import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import type { Room } from '../rooms/room';

const timers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 1000;

export function saveRoom(dir: string | undefined, room: Room): void {
  if (!dir) return;
  const key = room.id;
  const pending = timers.get(key);
  if (pending) clearTimeout(pending);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      writeRoom(dir, room);
    }, DEBOUNCE_MS).unref(),
  );
}

export function flushRoom(dir: string | undefined, room: Room): void {
  if (!dir) return;
  const pending = timers.get(room.id);
  if (pending) {
    clearTimeout(pending);
    timers.delete(room.id);
  }
  writeRoom(dir, room);
}

export function flushAll(dir: string | undefined, rooms: Room[]): void {
  for (const room of rooms) flushRoom(dir, room);
}

function writeRoom(dir: string, room: Room): void {
  mkdirSync(dir, { recursive: true });
  const doc: SceneDoc = room.doc;
  const payload = JSON.stringify({
    schemaVersion: doc.schemaVersion,
    roomId: room.id,
    savedAt: new Date().toISOString(),
    doc,
  });
  const target = join(dir, `${room.id}.json`);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, target);
}
