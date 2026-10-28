import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editorMissingWarning, resolveEditorDir } from '../src/editor-dir';

describe('editor 目录', () => {
  it('发布产物默认指向 dist/editor，环境变量优先', () => {
    expect(resolveEditorDir('/pkg/dist', {})).toBe('/pkg/dist/editor');
    expect(resolveEditorDir('/pkg/dist', { VIBE3D_EDITOR_DIR: '/custom' })).toBe('/custom');
  });

  it('从 src 启动时仍指向仓库里的 editor/dist', () => {
    expect(resolveEditorDir('/pkg/packages/daemon/src', {})).toBe('/pkg/packages/editor/dist');
  });

  it('目录里没有 index.html 时给出明确告警', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe3d-editor-missing-'));
    expect(editorMissingWarning(dir)).toContain(dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    expect(editorMissingWarning(dir)).toBeUndefined();
  });
});
