import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome(explicit?: string): string | null {
  const wanted = explicit ?? process.env.VIBE3D_CHROME;
  if (wanted) return existsSync(wanted) ? wanted : null;
  return CANDIDATES.find((path) => existsSync(path)) ?? null;
}

export interface ChromeHandle {
  wsUrl: string;
  close(): Promise<void>;
}

function waitForPortFile(dir: string, deadline: number): Promise<string> {
  const file = join(dir, 'DevToolsActivePort');
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      try {
        const text = readFileSync(file, 'utf8').split('\n');
        const port = Number(text[0]);
        if (port > 0) {
          resolve(`ws://127.0.0.1:${port}${text[1]?.trim() ?? '/devtools/browser'}`);
          return;
        }
      } catch {
        /* 尚未写入 */
      }
      if (Date.now() > deadline) {
        reject(new Error('Chrome 未在 15s 内暴露 DevToolsActivePort'));
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

export interface LaunchOptions {
  noSandbox?: boolean;
}

export async function launchChrome(executable: string, opts: LaunchOptions = {}): Promise<ChromeHandle> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'vibe3d-chrome-'));
  const noSandbox = opts.noSandbox ?? /^(1|true|yes|on)$/i.test(process.env.VIBE3D_CHROME_NO_SANDBOX ?? '');
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--hide-scrollbars',
    '--mute-audio',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1280,720',
    ...(noSandbox ? ['--no-sandbox', '--disable-gpu-sandbox'] : []),
    'about:blank',
  ];
  const child: ChildProcess = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  });
  const killTree = (signal: NodeJS.Signals): void => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      child.kill(signal);
    }
  };
  const wsUrl = await waitForPortFile(userDataDir, Date.now() + 15_000).catch(async (err) => {
    killTree('SIGKILL');
    await rmSync(userDataDir, { recursive: true, force: true });
    throw err;
  });
  await readFile(join(userDataDir, 'DevToolsActivePort')).catch(() => undefined);

  let closing = false;
  return {
    wsUrl,
    close: async () => {
      if (closing) return;
      closing = true;
      killTree('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          killTree('SIGKILL');
          resolve();
        }, 1500);
        child.once('exit', () => {
          clearTimeout(timer);
          killTree('SIGKILL');
          resolve();
        });
      });
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}
