import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export const configSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().min(0).max(65535).default(0),
  home: z.string().default(join(homedir(), '.vibe3d')),
  persist: z.boolean().default(false),
  gc: z.boolean().default(true),
  gcMaxAgeDays: z.coerce.number().int().min(1).max(3650).default(7),
  maxRooms: z.coerce.number().int().min(1).max(1024).default(32),
  rateLimit: z.coerce.number().min(0).max(100_000).default(200),
  rateBurst: z.coerce.number().int().min(1).max(100_000).default(200),
  token: z.string().min(8),
  assetRoots: z.array(z.string()).default([]),
  renderer: z.enum(['auto', 'none', 'chromium', 'editor']).default('auto'),
  chromePath: z.string().optional(),
  renderTimeoutMs: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  openEditor: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined ? fallback : !['0', 'false', 'off', 'no'].includes(v.toLowerCase());

export function parseConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): Config {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }

  const raw = {
    host: flags.host ?? env.VIBE3D_HOST,
    port: flags.port ?? env.VIBE3D_PORT,
    home: flags.home ?? env.VIBE3D_HOME,
    persist:
      flags.persist === true
        ? true
        : bool(typeof flags.persist === 'string' ? flags.persist : env.VIBE3D_PERSIST, false),
    gc: flags.gc === true ? true : bool(typeof flags.gc === 'string' ? flags.gc : env.VIBE3D_GC, true),
    gcMaxAgeDays: flags['gc-max-age'] ?? env.VIBE3D_GC_MAX_AGE,
    maxRooms: flags['max-rooms'] ?? env.VIBE3D_MAX_ROOMS,
    rateLimit: flags['rate-limit'] ?? env.VIBE3D_RATE_LIMIT,
    rateBurst: flags['rate-burst'] ?? env.VIBE3D_RATE_BURST,
    token: flags.token ?? env.VIBE3D_TOKEN ?? randomBytes(32).toString('hex'),
    assetRoots: flags['asset-root'] ?? env.VIBE3D_ASSET_ROOTS,
    renderer: flags.renderer ?? env.VIBE3D_RENDERER,
    chromePath: flags.chrome ?? env.VIBE3D_CHROME,
    renderTimeoutMs: flags['render-timeout'] ?? env.VIBE3D_RENDER_TIMEOUT,
    openEditor:
      flags['open-editor'] === true
        ? true
        : bool(
            typeof flags['open-editor'] === 'string' ? flags['open-editor'] : env.VIBE3D_OPEN_EDITOR,
            true,
          ),
    logLevel: flags['log-level'] ?? env.VIBE3D_LOG_LEVEL,
  };

  const parsed = configSchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
  );
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`配置非法：${issues}`);
  }
  if (parsed.data.host !== '127.0.0.1' && parsed.data.host !== 'localhost') {
    throw new Error('只允许监听 127.0.0.1 / localhost');
  }
  const roots = String(parsed.data.assetRoots)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => resolve(s));
  return {
    ...parsed.data,
    home: resolve(parsed.data.home),
    assetRoots: roots.length > 0 ? roots : [process.cwd()],
  };
}
