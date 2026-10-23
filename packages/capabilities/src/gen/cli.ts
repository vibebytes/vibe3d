import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFiles } from './generate';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'generated');

const files = generateFiles();
await mkdir(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  await writeFile(join(outDir, name), content, 'utf8');
}
console.log(`generated ${Object.keys(files).length} files -> ${outDir}`);
