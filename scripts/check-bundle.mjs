#!/usr/bin/env node
// Usage: node scripts/check-bundle.mjs <dist-dir> [more-dirs...]
// Fails when any bundled .js keeps a bare-specifier import — dist must run
// without node_modules (e.g. copied into the fast install bundle).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

// Bundlers emit real top-level imports at column 0; JSDoc examples like
// ` * import { Hono } from 'hono'` keep a leading ` * ` and never match.
const SIDE_EFFECT_RE = /^import\s*["']([^"']+)["']/gm;
const STATIC_RE = /^import[^;\n]*?from\s*["']([^"']+)["']/gm;
const EXPORT_FROM_RE = /^export[^;\n]*?from\s*["']([^"']+)["']/gm;
const DYNAMIC_RE = /^import\s*\(\s*["']([^"']+)["']/gm;

const BUILTINS = new Set(builtinModules);

function isAllowed(spec) {
  if (spec.startsWith('node:')) return true;
  if (spec.startsWith('./') || spec.startsWith('../')) return true;
  const bare = spec.split('/')[0];
  return BUILTINS.has(bare) || BUILTINS.has(spec);
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/check-bundle.mjs <dist-dir> [more-dirs...]');
  process.exit(2);
}

const violations = [];
for (const dir of dirs) {
  for (const file of walk(dir, [])) {
    const src = readFileSync(file, 'utf8');
    for (const re of [SIDE_EFFECT_RE, STATIC_RE, EXPORT_FROM_RE, DYNAMIC_RE]) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) {
        const spec = m[1];
        if (!isAllowed(spec)) violations.push(`${file}: ${spec}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`bare imports found (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`self-contained: ${dirs.join(', ')}`);
