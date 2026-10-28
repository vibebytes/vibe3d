import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor, versionMatch } from '../src/doctor';
import { connectClient } from './helpers/client';

describe('doctor', () => {
  it('没有 daemon 时报告 ok=false 且不抛', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe3d-doctor-'));
    const report = await runDoctor({ home, env: { ...process.env, VIBE3D_CHROME: '' } });
    expect(report.daemon.ok).toBe(false);
    expect(report.home).toBe(home);
    expect(report.node.startsWith('v')).toBe(true);
    expect(report.schemaJson.present).toBeTypeOf('boolean');
    expect(report.versions.mcp).toMatch(/^\d+\.\d+\.\d+$/);
    expect(report.versions.match).toBeNull();
  });

  it('没有 daemon 时版本比对是 n/a，两边都在且不同才是 false', () => {
    expect(versionMatch('0.2.0', false, undefined)).toBeNull();
    expect(versionMatch('0.2.0', true, '0.2.0')).toBe(true);
    expect(versionMatch('0.2.0', true, '0.1.0')).toBe(false);
  });

  it('VIBE3D_CHROME 指向不存在的文件时报告未找到，且不阻止 status', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vibe3d-doctor-chrome-'));
    const report = await runDoctor({ home, env: { VIBE3D_CHROME: '/no/such/chrome' } });
    expect(report.chrome.found).toBe(false);
    expect(report.chrome.reason).toContain('/no/such/chrome');
    const { client } = await connectClient({
      runtime: async () =>
        ({
          call: async () => ({ content: [{ type: 'text', text: '{"renderer":"unavailable"}' }] }),
        }) as never,
    });
    const result = await client.callTool({ name: 'vibe3d_status', arguments: {} });
    expect(result.isError).toBeUndefined();
  });
});
