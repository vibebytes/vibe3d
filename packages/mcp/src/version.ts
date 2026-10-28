import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageVersion(moduleDir: string, name: string): string {
  for (const rel of ['package.json', '../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(join(moduleDir, rel), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === name && typeof pkg.version === 'string') return pkg.version;
    } catch {
      /* 继续向上找 */
    }
  }
  return '0.0.0';
}

export function mcpVersion(moduleDir = dirname(fileURLToPath(import.meta.url))): string {
  return packageVersion(moduleDir, '@vibebyte/vibe3d-mcp');
}
