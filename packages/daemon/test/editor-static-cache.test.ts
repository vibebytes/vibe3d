import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import { type RouteDeps, serveEditor, serveEditorAsset } from '../src/http/routes';

function depsWith(files: Record<string, string>): RouteDeps {
  const dir = mkdtempSync(join(tmpdir(), 'vibe3d-editor-cache-'));
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  }
  return { editorDir: dir } as RouteDeps;
}

describe('editor static cache headers', () => {
  it('marks index.html as no-cache so rebuilds are picked up', () => {
    const res = serveEditorAsset(depsWith({ 'index.html': '<html></html>' }), '/index.html');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-cache');
  });

  it('marks the spa fallback (unknown path → index.html) as no-cache too', () => {
    const res = serveEditorAsset(depsWith({ 'index.html': '<html></html>' }), '/some/unknown/path');
    expect(res.headers.get('cache-control')).toContain('no-cache');
  });

  it('serves the root index via serveEditor with no-cache as well', async () => {
    const res = await serveEditor({} as Context, depsWith({ 'index.html': '<html></html>' }), null);
    expect(res.headers.get('cache-control')).toContain('no-cache');
  });

  it('keeps hashed chunks immutable', () => {
    const res = serveEditorAsset(depsWith({ 'assets/app-B4fg7.js': 'export{}' }), '/assets/app-B4fg7.js');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });
});
