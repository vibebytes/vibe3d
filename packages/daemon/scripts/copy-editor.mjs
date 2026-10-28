import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../editor/dist');
const dest = join(here, '../dist/editor');

if (!existsSync(join(source, 'index.html'))) {
  process.stderr.write(`editor dist 缺失：${source}。先构建 @vibebyte/vibe3d-editor。\n`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
process.stderr.write(`copied editor assets to ${dest}\n`);
