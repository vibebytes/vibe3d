import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGltf } from '../packages/daemon/src/assets/gltf-parse';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'assets');
const read = (name: string) => readFileSync(join(ROOT, name));
const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(readFileSync(join(ROOT, 'PROVENANCE.json'), 'utf8')) as {
  assets: Record<string, { bytes: number; sha256: string }>;
};

let failed = 0;
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${detail}`);
};

for (const [name, meta] of Object.entries(manifest.assets)) {
  const buf = read(name);
  check(`sha ${name}`, sha(buf) === meta.sha256 && buf.length === meta.bytes, `${buf.length}B`);
}

const expectReport: Record<string, (r: ReturnType<typeof parseGltf>) => boolean> = {
  'box-textured.glb': (r) => r.tris === 12 && r.textures === 1 && r.materials === 1,
  'pbr-metal.glb': (r) => r.tris > 600 && r.materials === 1 && r.textures === 0,
  'skinned-walk.glb': (r) => r.skins === 1 && r.animations.length === 1 && r.animations[0]?.name === 'Walk',
};

for (const [name, ok] of Object.entries(expectReport)) {
  const r = parseGltf(read(name), name);
  check(
    `parse ${name}`,
    ok(r),
    `tris=${r.tris} tex=${r.textures} anim=${r.animations.length} skin=${r.skins} diag=${r.size.diag.toFixed(2)}`,
  );
}

const rejects: Record<string, string> = {
  'draco-box.glb': 'E_ASSET_FORMAT',
  'external.gltf': 'E_ASSET_EXTERNAL_REFS',
  'truncated.glb': 'E_ASSET_FORMAT',
  'fake.glb.txt': 'E_ASSET_FORMAT',
};

const fuzz: Record<string, Buffer> = {
  'truncated.glb': read('box-textured.glb').subarray(0, 20),
  'fake.glb.txt': Buffer.from('this is not a glb\n'),
};
for (const [name, code] of Object.entries(rejects)) {
  const buf = fuzz[name] ?? read(name);
  let got = '';
  try {
    parseGltf(buf, name);
  } catch (err) {
    got = (err as { code?: string }).code ?? '';
  }
  check(`reject ${name}`, got === code, got || '(accepted)');
}

if (failed) {
  console.error(`${failed} fixture check(s) failed`);
  process.exit(1);
}
console.log('fixtures ok');
