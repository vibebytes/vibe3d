import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Harness, makeHarness as buildHarness } from './helpers/harness';

const makeHarness = (opts: { mcpSchemaFile: string }): Harness => buildHarness(opts);

const snapshot = {
  kind: 'vibe3d.mcp.schema',
  schemaVersion: '1',
  generatedAt: '2026-10-25T00:00:00.000Z',
  note: 'note',
  tools: [
    { name: 'vibe3d_help', description: 'help', inputSchema: { type: 'object' } },
    { name: 'vibe3d_status', description: 'status', inputSchema: { type: 'object' } },
  ],
  ops: [{ tool: 'vibe3d_status', ops: [{ op: 'status', tool: 'vibe3d_status' }] }],
};

function schemaFile(payload: unknown = snapshot): string {
  const file = join(mkdtempSync(join(tmpdir(), 'v3d-schema-')), 'schema.json');
  writeFileSync(file, JSON.stringify(payload));
  return file;
}

const get = async (h: Harness, path: string): Promise<Response> =>
  await h.app.request(path, { headers: { host: '127.0.0.1' } });

describe('GET /api/mcp/schema', () => {
  it('serves tools[] verbatim and exposes counts in headers', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/api/mcp/schema');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    expect(body).toEqual({ tools: snapshot.tools });
    expect(res.headers.get('x-schema-tools')).toBe('2');
    expect(res.headers.get('x-schema-stale')).toBeNull();
  });

  it('keeps generatedAt and ops behind ?expand=1', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/api/mcp/schema?expand=1');
    const body = (await res.json()) as typeof snapshot;
    expect(body.generatedAt).toBe(snapshot.generatedAt);
    expect(body.ops).toHaveLength(1);
    expect(body.tools).toHaveLength(2);
  });

  it('returns compact JSON with ?pretty=0', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/api/mcp/schema?pretty=0');
    expect(await res.text()).toBe(JSON.stringify({ tools: snapshot.tools }));
  });

  it('flags a snapshot older than the built mcp bundle', async () => {
    const file = schemaFile();
    const past = new Date(Date.now() - 60_000);
    utimesSync(file, past, past);
    writeFileSync(join(file, '..', 'index.js'), 'export {}');
    const res = await get(makeHarness({ mcpSchemaFile: file }), '/api/mcp/schema');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-schema-stale')).toBe('1');
  });

  it('404s when the snapshot has not been generated', async () => {
    const res = await get(
      makeHarness({ mcpSchemaFile: join(tmpdir(), 'v3d-missing-schema', 'schema.json') }),
      '/api/mcp/schema',
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'E_SCHEMA_MISSING' } });
  });

  it('500s when the snapshot is malformed', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'v3d-schema-')), 'schema.json');
    writeFileSync(file, '{"tools":');
    const res = await get(makeHarness({ mcpSchemaFile: file }), '/api/mcp/schema');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: 'E_SCHEMA_INVALID' } });
  });

  it('advertises the url from /health', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/health');
    const body = (await res.json()) as { schemaUrl?: string };
    expect(body.schemaUrl).toBe('/api/mcp/schema');
  });
});

describe('GET /api/mcp/repair-stats', () => {
  const ledger = {
    version: 1,
    updatedAt: '2026-10-25T10:00:00.000Z',
    firstSeenAt: '2026-10-25T09:00:00.000Z',
    total: 3,
    tools: [
      {
        tool: 'vibe3d_camera',
        capability: 'camera.set',
        count: 2,
        fixes: [{ fix: 'p,target,fov→camera.{p,target,fov}', count: 2 }],
      },
      { tool: 'vibe3d_node', capability: 'node.create', count: 1, fixes: [{ fix: 'shape→geometry.type', count: 1 }] },
    ],
  };

  const withLedger = (payload: unknown): Harness => {
    const h = makeHarness({ mcpSchemaFile: schemaFile() });
    writeFileSync(join(h.config.home, 'mcp-repair-stats.json'), JSON.stringify(payload));
    return h;
  };

  it('serves the ledger MCP wrote into the daemon home', async () => {
    const res = await get(withLedger(ledger), '/api/mcp/repair-stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 3, tools: ledger.tools });
    expect(res.headers.get('x-repair-tools')).toBe('2');
    expect(res.headers.get('x-repair-updated-at')).toBe(ledger.updatedAt);
  });

  it('returns an empty ledger before MCP has written one', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/api/mcp/repair-stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0, tools: [] });
  });

  it('degrades to an empty ledger on a corrupt file instead of 500ing', async () => {
    const h = makeHarness({ mcpSchemaFile: schemaFile() });
    writeFileSync(join(h.config.home, 'mcp-repair-stats.json'), '{"total":');
    const res = await get(h, '/api/mcp/repair-stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0, tools: [] });
    expect(res.headers.get('x-repair-corrupt')).toBe('1');
  });

  it('advertises the url from /health', async () => {
    const res = await get(makeHarness({ mcpSchemaFile: schemaFile() }), '/health');
    const body = (await res.json()) as { repairStatsUrl?: string };
    expect(body.repairStatsUrl).toBe('/api/mcp/repair-stats');
  });
});
