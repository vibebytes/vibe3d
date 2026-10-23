import { readFileSync } from 'node:fs';

export interface ParsedArgs {
  _: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (body.startsWith('no-')) {
      flags[body.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return { _: positional, flags };
}

export function str(flags: ParsedArgs['flags'], key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

export function num(flags: ParsedArgs['flags'], key: string): number | undefined {
  const value = str(flags, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function bool(flags: ParsedArgs['flags'], key: string): boolean {
  return flags[key] === true || flags[key] === 'true' || flags[key] === '1';
}

export function vec(flags: ParsedArgs['flags'], key: string): [number, number, number] | undefined {
  const value = str(flags, key);
  if (!value) return undefined;
  const parts = value.split(',').map((item) => Number(item.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`--${key} 需要 x,y,z 三个数字，收到：${value}`);
  }
  return parts as [number, number, number];
}

export function parseSize(value: string | undefined): { width: number; height: number } | undefined {
  if (!value) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`--size 需要 WxH，收到：${value}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function jsonArg(value: string | undefined): unknown {
  if (!value) return undefined;
  const text = value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}
