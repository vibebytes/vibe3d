import type { Studio } from '@vibebyte/vibe3d-client';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  flushRepairStats,
  readRepairStats,
  recordRepair,
  resetRepairStats,
  snapshotRepairStats,
  statsFile,
} from '../src/repair-stats';
import { ToolRuntime } from '../src/tools';

const home = (): string => mkdtempSync(join(tmpdir(), 'v3d-repair-'));
const cameraFix = 'p,target,fov→camera.{p,target,fov}';

afterEach(() => {
  resetRepairStats();
});

describe('repair ledger', () => {
  it('counts repeats of the same fix and sorts by frequency', () => {
    const dir = home();
    const base = { tool: 'vibe3d_camera', capability: 'camera.set', fixes: [cameraFix] };
    recordRepair(base, dir);
    recordRepair(base, dir);
    recordRepair({ tool: 'vibe3d_node', capability: 'node.create', fixes: ['shape→geometry.type'] }, dir);

    const snap = snapshotRepairStats();
    expect(snap.total).toBe(3);
    expect(snap.tools[0]).toMatchObject({ tool: 'vibe3d_camera', capability: 'camera.set', count: 2 });
    expect(snap.tools[0]?.fixes[0]).toMatchObject({ fix: cameraFix, count: 2 });
    expect(snap.tools[1]).toMatchObject({ tool: 'vibe3d_node', count: 1 });
  });

  it('persists atomically to <home>/mcp-repair-stats.json', async () => {
    const dir = home();
    recordRepair({ tool: 'vibe3d_material', capability: 'material.create', fixes: ['preset 归一'] }, dir);
    await flushRepairStats();

    const file = statsFile(dir);
    expect(file).toBe(join(dir, 'mcp-repair-stats.json'));
    expect(existsSync(file)).toBe(true);
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { total: number; tools: unknown[] };
    expect(doc.total).toBe(1);
    expect(doc.tools).toHaveLength(1);
  });

  it('reads a missing ledger as empty instead of throwing', async () => {
    const doc = await readRepairStats(statsFile(home()));
    expect(doc).toMatchObject({ version: 1, total: 0, tools: [] });
  });
});

describe('runtime counts repairs', () => {
  it('records a repaired camera call into the ledger', async () => {
    const dir = home();
    const studio = {
      home: dir,
      client: { call: async () => ({}) },
      createRoom: async () => ({ id: 'r_0000000a' }),
      room: (roomId: string) => ({
        id: roomId,
        invoke: async (method: string) =>
          method === 'room.use' ? { roomId } : { revision: 1, camera: {} },
      }),
    } as unknown as Studio;

    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_use_room', { roomId: 'r_0000000a' });
    await runtime.call('vibe3d_camera', { op: 'set', p: [3, 3, 3], target: [0, 0, 0], fov: 45 });
    await flushRepairStats();

    const doc = await readRepairStats(statsFile(dir));
    expect(doc.total).toBeGreaterThan(0);
    expect(doc.tools.some((entry) => entry.tool === 'vibe3d_camera')).toBe(true);
  });
});
