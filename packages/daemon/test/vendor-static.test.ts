import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type RouteDeps, serveVendorAsset } from '../src/http/routes';

function depsWith(files: string[]): RouteDeps {
  const dir = mkdtempSync(join(tmpdir(), 'vibe3d-vendor-'));
  for (const f of files) {
    const path = join(dir, 'vendor', f);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'x');
  }
  return { editorDir: dir } as RouteDeps;
}

describe('GET /vendor/*', () => {
  it('serves draco wasm as application/wasm with immutable cache', () => {
    const res = serveVendorAsset(depsWith(['draco/draco_decoder.wasm']), '/draco/draco_decoder.wasm');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('serves basis transcoder js as javascript', () => {
    const res = serveVendorAsset(depsWith(['basis/basis_transcoder.js']), '/basis/basis_transcoder.js');
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('rejects traversal, unknown dirs and missing files', () => {
    const deps = depsWith(['draco/draco_decoder.wasm']);
    expect(() => serveVendorAsset(deps, '/draco/../../secret')).toThrow(/白名单/);
    expect(() => serveVendorAsset(deps, '/../etc/passwd')).toThrow(/白名单/);
    expect(() => serveVendorAsset(deps, '/other/x.js')).toThrow(/白名单/);
    expect(serveVendorAsset(deps, '/draco/nope.wasm').status).toBe(404);
  });
});
