import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';

export function resolveEditorDir(moduleDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VIBE3D_EDITOR_DIR;
  if (typeof override === 'string' && override.length > 0) return override;
  if (moduleDir.endsWith(`${sep}src`)) return join(moduleDir, '../../editor/dist');
  return join(moduleDir, 'editor');
}

export function editorMissingWarning(dir: string): string | undefined {
  if (existsSync(join(dir, 'index.html'))) return undefined;
  return `editor 静态资源缺失：${dir}。发布包应包含 dist/editor；本地开发请先构建 editor，或设置 VIBE3D_EDITOR_DIR。`;
}
