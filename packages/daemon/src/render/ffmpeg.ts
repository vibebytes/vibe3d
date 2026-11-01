import { spawn } from 'node:child_process';
import type { Ffmpeg } from '../context';

export function systemFfmpeg(bin = process.env.VIBE3D_FFMPEG ?? 'ffmpeg'): Ffmpeg {
  return {
    available: () =>
      new Promise((resolve) => {
        const child = spawn(bin, ['-version'], { stdio: 'ignore' });
        child.on('error', () => resolve(false));
        child.on('exit', (code) => resolve(code === 0));
      }),
    run: (args, cwd) =>
      new Promise((resolve, reject) => {
        const child = spawn(bin, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr = (stderr + chunk.toString('utf8')).slice(-2000);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg 退出码 ${code}：${stderr.trim()}`));
        });
      }),
  };
}
