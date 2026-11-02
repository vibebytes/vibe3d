import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import type { ParsedArgs } from './args';
import { commandOf, execute } from './exec';
import { LOCAL_COMMANDS, connectOptions, runDaemon, runLocal } from './local';

export async function run(
  parsed: ParsedArgs,
  connect: (opts: StudioOptions) => Promise<Studio> = Studio.connect,
): Promise<unknown> {
  if (parsed._[0] === 'daemon') {
    await runDaemon(parsed);
    return undefined;
  }
  const studio = await connect(connectOptions(parsed.flags));
  const hit = commandOf(parsed._);
  if (hit && !LOCAL_COMMANDS.has(hit.command)) return execute(studio, hit, parsed.flags);
  return runLocal(studio, parsed);
}
