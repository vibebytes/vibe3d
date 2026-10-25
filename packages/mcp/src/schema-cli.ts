#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaSnapshot } from './schema';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'schema.json');
const snapshot = schemaSnapshot();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify({ event: 'schema.written', out, tools: snapshot.tools.length, ops: snapshot.ops.length })}\n`,
);
