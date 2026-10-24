import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const gen = join(root, 'packages/capabilities/generated');
const snapshot = mkdtempSync(join(tmpdir(), 'vibe3d-gen-'));

try {
  cpSync(gen, snapshot, { recursive: true });
  execSync(`"${join(root, 'node_modules/.bin/tsx')}" packages/capabilities/src/gen/cli.ts`, {
    cwd: root,
    stdio: 'inherit',
  });

  const names = new Set([...readdirSync(snapshot), ...readdirSync(gen)]);
  const stale = [...names].filter((file) => {
    try {
      return !readFileSync(join(snapshot, file)).equals(readFileSync(join(gen, file)));
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`gen not idempotent: ${stale.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('gen idempotent');
  }
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
