import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRuns, resolveDaemonEntry } from '@vibebyte/vibe3d-client';
import { mcpVersion } from './version';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function versionMatch(mcp: string, daemonOk: boolean, daemonVersion?: string): boolean | null {
  if (!daemonOk) return null;
  return daemonVersion === mcp;
}

export interface DoctorReport {
  node: string;
  home: string;
  runs: Array<{ pid: number; url: string }>;
  daemon: { ok: boolean; url?: string; version?: string };
  daemonEntry: { file: string } | { error: string };
  chrome: { found: boolean; path?: string; reason?: string };
  schemaJson: { present: boolean; path?: string };
  versions: { mcp: string; daemon?: string; match: boolean | null };
}

export function locateSchema(moduleDir: string): string | undefined {
  for (const path of [join(moduleDir, 'schema.json'), join(moduleDir, '../dist/schema.json')]) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

function chromeStatus(env: NodeJS.ProcessEnv): DoctorReport['chrome'] {
  const wanted = env.VIBE3D_CHROME;
  if (typeof wanted === 'string' && wanted.length > 0) {
    if (existsSync(wanted)) return { found: true, path: wanted };
    return { found: false, reason: `VIBE3D_CHROME 指向的文件不存在：${wanted}` };
  }
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found) return { found: true, path: found };
  return {
    found: false,
    reason:
      '未找到 Chrome / Chromium。渲染不可用，场景编辑仍可用。可设置 VIBE3D_CHROME 指向浏览器可执行文件。Windows 尚未验证。',
  };
}

async function probe(url: string, token?: string): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${url}/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { version?: unknown };
    return { ok: true, version: typeof body.version === 'string' ? body.version : undefined };
  } catch {
    return { ok: false };
  }
}

export async function runDoctor(
  opts: { home?: string; env?: NodeJS.ProcessEnv; moduleDir?: string } = {},
): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.VIBE3D_HOME ?? join(homedir(), '.vibe3d');
  const runs = listRuns(home).map((run) => ({
    pid: run.pid,
    url: `http://${run.host}:${run.port}`,
    token: run.token,
  }));
  let daemon: DoctorReport['daemon'] = { ok: false };
  for (const run of runs) {
    const health = await probe(run.url, run.token);
    if (health.ok) {
      daemon = { ok: true, url: run.url, version: health.version };
      break;
    }
  }
  let daemonEntry: DoctorReport['daemonEntry'];
  try {
    daemonEntry = { file: resolveDaemonEntry().file };
  } catch (err) {
    daemonEntry = { error: err instanceof Error ? err.message : String(err) };
  }
  const mcp = mcpVersion(opts.moduleDir);
  const schema = locateSchema(opts.moduleDir ?? dirname(fileURLToPath(import.meta.url)));
  return {
    node: process.version,
    home,
    runs: runs.map(({ pid, url }) => ({ pid, url })),
    daemon,
    daemonEntry,
    chrome: chromeStatus(env),
    schemaJson: schema ? { present: true, path: schema } : { present: false },
    versions: {
      mcp,
      daemon: daemon.version,
      match: versionMatch(mcp, daemon.ok, daemon.version),
    },
  };
}

export function formatDoctor(report: DoctorReport): string {
  const entry = 'file' in report.daemonEntry ? report.daemonEntry.file : report.daemonEntry.error;
  const lines = [
    'vibe3d doctor',
    `node: ${report.node}`,
    `home: ${report.home}`,
    `daemon: ${report.daemon.ok ? `ok ${report.daemon.url ?? ''} ${report.daemon.version ?? ''}`.trim() : 'not running'}`,
    `daemon entry: ${entry}`,
    `chrome: ${report.chrome.found ? `found ${report.chrome.path ?? ''}` : `missing (${report.chrome.reason ?? ''})`}`,
    `schema.json: ${report.schemaJson.present ? 'present' : 'missing'}`,
    `versions: mcp ${report.versions.mcp} daemon ${report.versions.daemon ?? '-'} match ${report.versions.match === null ? 'n/a' : report.versions.match ? 'yes' : 'no'}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}
