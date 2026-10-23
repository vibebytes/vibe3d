import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'packages/editor/dist';
const BUDGET = 900 * 1024;

function mainChunk() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const m = /<script[^>]+src="[^"]*?assets\/(index-[\w-]+\.js)"/.exec(html);
  if (!m) throw new Error('dist/index.html 里找不到入口 script');
  return m[1];
}

const assets = join(DIST, 'assets');
const name = mainChunk();
const buf = readFileSync(join(assets, name));
const gz = gzipSync(buf, { level: 9 }).length;
const rows = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const b = readFileSync(join(assets, f));
    return { f, raw: b.length, gz: gzipSync(b, { level: 9 }).length };
  })
  .sort((a, b) => b.gz - a.gz);

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log(`entry ${name}`);
for (const r of rows.slice(0, 5)) console.log(`  ${r.f}  raw ${kb(r.raw)}  gzip ${kb(r.gz)}`);
console.log(`budget 900 KB gzip → entry ${kb(gz)} (${((gz / BUDGET) * 100).toFixed(1)}%)`);

const css = readdirSync(assets).filter((f) => f.endsWith('.css'));
for (const f of css) console.log(`  css ${f}  gzip ${kb(gzipSync(readFileSync(join(assets, f))).length)}`);

if (!statSync(join(assets, name)).isFile()) throw new Error('entry 不存在');
if (gz > BUDGET) {
  console.error(`FAIL 主 chunk gzip ${kb(gz)} 超过预算 900 KB`);
  process.exit(1);
}
console.log('PASS T21 主 chunk 在 900 KB gzip 预算内');
