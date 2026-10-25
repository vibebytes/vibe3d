import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import type { Room } from '../rooms/room';

const timers = new Map<string, NodeJS.Timeout>();
const chains = new Map<string, Promise<void>>();
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
      void writeRoomAsync(dir, room);
    }, DEBOUNCE_MS).unref(),
  );
}

export function cancelRoomSave(dir: string | undefined, roomId: string): void {
  if (!dir) return;
  const pending = timers.get(roomId);
  if (pending) {
    clearTimeout(pending);
    timers.delete(roomId);
  }
}

export function flushRoom(dir: string | undefined, room: Room): void {
  if (!dir) return;
  cancelRoomSave(dir, room.id);
  writeRoomSync(dir, room);
}

export function flushAll(dir: string | undefined, rooms: Room[]): void {
  for (const room of rooms) flushRoom(dir, room);
}

function payloadOf(room: Room): string {
  const doc: SceneDoc = room.doc;
  return JSON.stringify({
    schemaVersion: doc.schemaVersion,
    roomId: room.id,
    savedAt: new Date().toISOString(),
    doc,
  });
}

function writeRoomSync(dir: string, room: Room): void {
  const payload = payloadOf(room);
  const target = join(dir, `${room.id}.json`);
  const tmp = `${target}.tmp`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, target);
}

function writeRoomAsync(dir: string, room: Room): Promise<void> {
  const prev = chains.get(room.id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const payload = payloadOf(room);
    const target = join(dir, `${room.id}.json`);
    const tmp = `${target}.tmp`;
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, target);
  });
  const tail = next.catch(() => undefined);
  chains.set(room.id, tail);
  void tail.then(() => {
    if (chains.get(room.id) === tail) chains.delete(room.id);
  });
  return next;
}
