import { createReadStream, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const LIBS = fileURLToPath(new URL('./node_modules/three/examples/jsm/libs/', import.meta.url));

export const VENDOR_FILES: Record<string, string[]> = {
  draco: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  basis: ['basis_transcoder.js', 'basis_transcoder.wasm'],
  meshopt: ['meshopt_decoder.module.js'],
};

const SRC_DIR: Record<string, string> = { draco: 'draco', basis: 'basis', meshopt: '' };

const source = (dir: string, name: string): string => join(LIBS, SRC_DIR[dir] ?? '', name);

function resolveVendor(path: string): { file: string; mime: string } | null {
  const m = /^\/vendor\/([^/]+)\/([^/]+)$/.exec(path.split('?')[0] ?? '');
  if (!m) return null;
  const [, dir = '', name = ''] = m;
  if (!VENDOR_FILES[dir]?.includes(name)) return null;
  const file = source(dir, name);
  try {
    if (!statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  const mime = name.endsWith('.wasm')
    ? 'application/wasm'
    : name.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';
  return { file, mime };
}

export function vendorDecoders(): Plugin {
  return {
    name: 'vibe3d-vendor-decoders',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const hit = resolveVendor(req.url ?? '');
        if (!hit) return next();
        res.setHeader('content-type', hit.mime);
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        createReadStream(hit.file).pipe(res);
      });
    },
    async writeBundle(options) {
      const out = options.dir ?? join(dirname(fileURLToPath(import.meta.url)), 'dist');
      for (const [dir, names] of Object.entries(VENDOR_FILES)) {
        await mkdir(join(out, 'vendor', dir), { recursive: true });
        await Promise.all(names.map((name) => copyFile(source(dir, name), join(out, 'vendor', dir, name))));
      }
    },
  };
}
