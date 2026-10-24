#!/usr/bin/env node
import { Vibe3DError, isVibe3DError } from '@vibebyte/vibe3d-client';
import { parseArgs } from './args';
import { run } from './commands';
import { HELP } from './help';

function exitCode(err: unknown): number {
  if (!isVibe3DError(err)) return 1;
  switch (err.code) {
    case 'E_INVALID_PARAMS':
    case 'E_INVALID_REQUEST':
    case 'E_PARSE':
    case 'E_NO_METHOD':
      return 2;
    case 'E_UNAUTHORIZED':
      return 3;
    case 'E_ROOM_NOT_FOUND':
    case 'E_ASSET_MISSING':
    case 'E_JOB_NOT_FOUND':
      return 4;
    case 'E_RENDER_UNAVAILABLE':
    case 'E_NO_DAEMON':
    case 'E_NETWORK':
    case 'E_TIMEOUT':
      return 5;
    default:
      return 1;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (argv[0] === '--version' || argv[0] === 'version') {
    const { DAEMON_VERSION, PROTOCOL_VERSION } = await import('@vibebyte/vibe3d-protocol');
    process.stdout.write(`${JSON.stringify({ daemon: DAEMON_VERSION, protocol: PROTOCOL_VERSION })}\n`);
    return;
  }
  const parsed = parseArgs(argv);
  const pretty = parsed.flags.pretty === true || parsed.flags.pretty === 'true';
  try {
    const result = await run(parsed);
    if (result === undefined) return;
    process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
  } catch (err) {
    const error = err instanceof Error ? err : new Vibe3DError('E_INTERNAL', String(err));
    const payload = isVibe3DError(error) ? error.toJSON() : { code: 'E_INTERNAL', message: error.message };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = exitCode(error);
  }
}

void main();
