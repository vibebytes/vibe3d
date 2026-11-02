import { CAPABILITIES, CLI_COMMANDS, type CapabilityName, type CliSpec } from '@vibebyte/vibe3d-capabilities';
import type { Studio } from '@vibebyte/vibe3d-client';
import type { ParsedArgs } from './args';
import { paramsFromFlags } from './flags';
import { settleJob, writeImages } from './output';

export interface CommandHit {
  command: string;
  capability: CapabilityName;
  positionals: string[];
}

export function commandOf(argv: string[]): CommandHit | undefined {
  const two = argv.slice(0, 2).join(' ');
  const one = argv[0] ?? '';
  const matches = (command: string) => (item: (typeof CLI_COMMANDS)[number]) =>
    item.command === command || (item.synonyms as readonly string[]).includes(command);
  const row =
    (argv.length >= 2 ? CLI_COMMANDS.find(matches(two)) : undefined) ?? CLI_COMMANDS.find(matches(one));
  if (!row) return undefined;
  const words = row.command.split(' ').length;
  return { command: row.command, capability: row.capability, positionals: argv.slice(words) };
}

export async function execute(studio: Studio, hit: CommandHit, flags: ParsedArgs['flags']): Promise<unknown> {
  const spec = CAPABILITIES[hit.capability];
  const cli = spec.cli as CliSpec | undefined;
  const resolved = paramsFromFlags(hit.capability, hit.positionals, flags);
  const result = await studio.client.call(hit.capability, resolved.params, { roomId: resolved.roomId });
  const settled = await settleJob(studio, result, cli?.job, flags);
  if (cli?.job) return settled;
  const out = typeof flags.out === 'string' ? flags.out : undefined;
  return writeImages(settled, out);
}
