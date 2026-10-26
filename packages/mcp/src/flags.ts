const BOOLEAN_KEYS = new Set(['autostart', 'persist', 'open-editor']);

export function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (BOOLEAN_KEYS.has(key)) {
      if (next === 'true' || next === 'false') {
        flags[key] = next === 'true';
        i++;
      } else {
        flags[key] = true;
      }
    } else if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}
