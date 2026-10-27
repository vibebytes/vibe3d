import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function isStaleLock(file: string): boolean {
  let pid: number;
  try {
    pid = Number(readFileSync(file, 'utf8').trim());
  } catch {
    return true;
  }
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export function acquireLock(home: string): () => void {
  if (/^(1|true|yes|on)$/i.test(process.env.VIBE3D_SKIP_LOCK ?? '')) {
    return () => {};
  }
  mkdirSync(home, { recursive: true });
  const file = join(home, 'lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
      return () => {
        try {
          unlinkSync(file);
        } catch {
          /* 已删除 */
        }
      };
    } catch (err) {
      if (attempt > 0 || !isStaleLock(file)) {
        const locked = new Error(`已有 daemon 持有锁：${file}`);
        (locked as Error & { code?: string }).code = 'E_LOCKED';
        (locked as Error & { cause?: unknown }).cause = err;
        throw locked;
      }
      try {
        unlinkSync(file);
      } catch {
        /* 竞态下已被别人清掉 */
      }
    }
  }
  throw new Error(`无法获取锁：${file}`);
}
