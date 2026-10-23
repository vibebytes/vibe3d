import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import { type ParsedArgs, bool, jsonArg, num, parseSize, str, vec } from './args';

function connectOptions(flags: ParsedArgs['flags']): StudioOptions {
  return {
    home: str(flags, 'home') ?? process.env.VIBE3D_HOME,
    url: str(flags, 'url') ?? process.env.VIBE3D_URL,
    token: str(flags, 'token') ?? process.env.VIBE3D_TOKEN,
    autostart: flags.autostart !== false,
  };
}

function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as Partial<T>;
}

function need(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

async function runDaemon(parsed: ParsedArgs): Promise<void> {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@vibebyte/vibe3d-daemon');
  let root = dirname(entry);
  while (!existsSync(join(root, 'package.json')) && dirname(root) !== root) root = dirname(root);
  const dist = join(root, 'dist', 'index.js');
  const file = existsSync(dist) ? dist : join(root, 'src', 'index.ts');
  const loader = file.endsWith('.ts') ? ['--import', 'tsx'] : [];
  const argv: string[] = [];
  for (const [key, value] of Object.entries(parsed.flags)) {
    if (['home', 'url', 'pretty', 'autostart'].includes(key)) continue;
    if (value === false) continue;
    argv.push(`--${key}`);
    if (typeof value === 'string') argv.push(value);
  }
  const home = str(parsed.flags, 'home');
  if (home) argv.push('--home', resolve(home));
  await new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, [...loader, file, ...argv], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`daemon 退出码 ${code}`))));
    child.on('error', fail);
  });
}

export async function run(parsed: ParsedArgs): Promise<unknown> {
  const [group, command, ...rest] = parsed._;
  const { flags } = parsed;

  if (group === 'daemon') {
    await runDaemon(parsed);
    return undefined;
  }

  const studio = await Studio.connect(connectOptions(flags));

  if (group === 'status') {
    const [health, hello] = await Promise.all([studio.health(), studio.hello()]);
    return { ...health, capabilities: hello.capabilities, home: studio.home };
  }

  if (group === 'room') {
    if (command === 'new') {
      const room = await studio.createRoom(
        pick({ name: str(flags, 'name'), template: str(flags, 'template') }) as never,
      );
      const info = await room.info();
      return { ...info, url: `${studio.url}/r/${room.id}` };
    }
    if (command === 'ls' || command === 'list') return studio.listRooms();
    if (command === 'show') return studio.room(need(rest[0], 'room show 需要 roomId')).info();
    if (command === 'rm' || command === 'close') {
      return studio.closeRoom(need(rest[0], 'room rm 需要 roomId'), bool(flags, 'purge'));
    }
  }

  if (group === 'call') {
    const method = need(command, 'call 需要 method');
    return studio.client.call(method, (jsonArg(str(flags, 'params')) ?? {}) as Record<string, unknown>, {
      roomId: str(flags, 'room'),
    });
  }

  const room = studio.room(need(rest[0], `${parsed._.join(' ')} 需要 roomId`));

  if (group === 'scene') {
    if (command === 'get') return room.get();
    if (command === 'summary') return room.summary();
    if (command === 'undo') return room.undo();
    if (command === 'redo') return room.redo();
    if (command === 'diff') return room.diff(pick({ from: num(flags, 'from'), to: num(flags, 'to') }));
    if (command === 'apply') {
      const ops = jsonArg(str(flags, 'ops'));
      if (!Array.isArray(ops)) throw new Error('scene apply 需要 --ops <json|@file>，且必须是 op 数组');
      return room.apply(ops as never, { dryRun: bool(flags, 'dry-run') });
    }
  }

  if (group === 'node') {
    if (command === 'create') {
      return room.createNode(
        pick({
          kind: str(flags, 'kind') ?? 'mesh',
          name: str(flags, 'name'),
          parent: str(flags, 'parent') ?? null,
          shape: str(flags, 'shape'),
          size: vec(flags, 'size'),
          radius: num(flags, 'radius'),
          height: num(flags, 'height'),
          color: str(flags, 'color'),
          transform: jsonArg(str(flags, 'transform')),
        }) as never,
      );
    }
    if (command === 'update') {
      return room.updateNode({
        nodeId: need(rest[1], 'node update 需要 nodeId'),
        patch: (jsonArg(str(flags, 'patch')) ?? {}) as never,
      });
    }
    if (command === 'rm' || command === 'delete') {
      return room.deleteNode({
        nodeId: need(rest[1], 'node rm 需要 nodeId'),
        cascade: flags.cascade !== false,
      });
    }
  }

  if (group === 'stage' && command === 'set') {
    const preset = str(flags, 'preset');
    const stage = jsonArg(str(flags, 'stage'));
    return room.setStage({ stage: (stage ?? (preset ? { preset } : undefined)) as never });
  }

  if (group === 'anim' && command === 'play') {
    return room.play({
      nodeId: need(rest[1], 'anim play 需要 nodeId'),
      clip: str(flags, 'clip'),
      speed: num(flags, 'speed'),
    } as never);
  }

  if (group === 'camera' && command === 'set') {
    return room.setCamera({
      frame: str(flags, 'frame') as never,
      camera: pick({ p: vec(flags, 'p'), target: vec(flags, 'target'), fov: num(flags, 'fov') }) as never,
    } as never);
  }

  if (group === 'render' && command === 'snapshot') {
    const size = parseSize(str(flags, 'size'));
    const shot = await room.snapshot({
      width: size?.width,
      height: size?.height,
      format: str(flags, 'format') as never,
      settleMs: num(flags, 'settle-ms'),
      at: num(flags, 'at'),
      transparent: bool(flags, 'transparent') ? true : undefined,
    });
    const out = str(flags, 'out');
    if (!out) return { ...shot, bytes: shot.bytes.toString('base64') };
    const path = resolve(out);
    await writeFile(path, shot.bytes);
    return {
      path,
      bytes: shot.bytes.length,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      revision: shot.revision,
    };
  }

  if (group === 'export' && command === 'glb') {
    const node = str(flags, 'node');
    const out = await room.exportGlb(pick({ nodeIds: node ? ([node] as never) : undefined }));
    const dest = str(flags, 'out');
    if (!dest) return out;
    const res = await fetch(new URL(out.url, studio.url));
    if (!res.ok) throw new Error(`下载 GLB 失败：HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const path = resolve(dest);
    await writeFile(path, bytes);
    return { path, bytes: bytes.length, jobId: out.jobId, url: out.url, revision: out.revision };
  }

  if (group === 'open') {
    return room.open(pick({ focus: str(flags, 'focus'), reuse: flags.reuse !== false }));
  }

  if (group === 'model' && command === 'import') {
    return room.importNode(
      pick({
        src: need(rest[1], 'model import 需要 <src>'),
        name: str(flags, 'name'),
        autoplay: bool(flags, 'autoplay'),
        policy: str(flags, 'policy'),
      }) as never,
    );
  }

  if (group === 'asset' && command === 'inspect') {
    return room.inspect({
      src: need(rest[1], 'asset inspect 需要 <src>'),
      policy: str(flags, 'policy'),
    } as never);
  }

  throw new Error(`未知命令：${parsed._.join(' ')}（运行 vibe3d help）`);
}
