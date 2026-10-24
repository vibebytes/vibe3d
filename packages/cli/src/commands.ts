import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Studio, type StudioOptions } from '@vibebyte/vibe3d-client';
import { type ParsedArgs, bool, jsonArg, num, parseSize, str, vec } from './args';
import { cameraFromFlags, saveNameFrom } from './camera-args';
import { backdropFromFlags, booleanFromFlags, decalFromFlags, tubeFromFlags } from './decal-args';
import { applyToFromFlags, clipFromFlags, fogFromFlags, fxSpecFromFlags, playOptsFromFlags } from './fx-args';
import { parseLookFlags } from './look';
import { mapFromFlags, materialPatchFromFlags } from './material-args';
import { readSceneDocFile } from './scene-io';

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
    if (command === 'query') {
      return room.queryNodes(
        pick({
          name: str(flags, 'name'),
          kind: str(flags, 'kind'),
          materialId: str(flags, 'material'),
          minY: num(flags, 'min-y'),
          maxY: num(flags, 'max-y'),
          hasAnim: flags['has-anim'] === undefined ? undefined : bool(flags, 'has-anim'),
          visible: flags.visible === undefined ? undefined : bool(flags, 'visible'),
          limit: num(flags, 'limit'),
          cursor: num(flags, 'cursor'),
          bbox: jsonArg(str(flags, 'bbox')),
        }) as never,
      );
    }
    if (command === 'stats') return room.stats();
    if (command === 'validate') {
      return room.validate(
        pick({
          checks: str(flags, 'checks')?.split(','),
          tolerance: num(flags, 'tolerance'),
          ignore: str(flags, 'ignore')?.split(','),
          bounds: jsonArg(str(flags, 'bounds')),
        }) as never,
      );
    }
    if (command === 'undo') return room.undo(pick({ opId: str(flags, 'op-id') }) as never);
    if (command === 'redo') return room.redo();
    if (command === 'diff') return room.diff(pick({ from: num(flags, 'from'), to: num(flags, 'to') }));
    if (command === 'apply') {
      const ops = jsonArg(str(flags, 'ops'));
      if (!Array.isArray(ops)) throw new Error('scene apply 需要 --ops <json|@file>，且必须是 op 数组');
      return room.apply(ops as never, { dryRun: bool(flags, 'dry-run') });
    }
    if (command === 'export') {
      const out = await room.exportScene();
      const dest = str(flags, 'out');
      if (!dest) return out;
      const body = `${JSON.stringify(out.doc, null, 2)}\n`;
      const path = resolve(dest);
      await writeFile(path, body);
      return { path, revision: out.revision, bytes: Buffer.byteLength(body) };
    }
    if (command === 'import') {
      const doc = await readSceneDocFile(need(rest[1], 'scene import 需要 <file>'));
      const expectRevision = num(flags, 'expect-revision');
      return room.importScene(expectRevision === undefined ? { doc } : { doc, expectRevision });
    }
    if (command === 'checkpoint') {
      return room.checkpoint(pick({ name: str(flags, 'name') }) as never);
    }
    if (command === 'checkpoints' || command === 'ckpt') return room.checkpoints();
    if (command === 'restore') return room.restore(need(rest[1], 'scene restore 需要 <checkpointId>'));
  }

  if (group === 'node') {
    if (command === 'get') return room.getNode(need(rest[1], 'node get 需要 nodeId'));
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
    if (command === 'clone') {
      return room.cloneNode({
        nodeId: need(rest[1], 'node clone 需要 nodeId'),
        count: num(flags, 'count'),
        parent: flags.parent === undefined ? undefined : (str(flags, 'parent') ?? null),
        transform: jsonArg(str(flags, 'transform')) as never,
      } as never);
    }
    if (command === 'transform-many') {
      return room.transformMany(
        pick({
          ids: str(flags, 'ids')?.split(','),
          filter: jsonArg(str(flags, 'filter')),
          translate: vec(flags, 'translate'),
          rotate: vec(flags, 'rotate'),
          scale: vec(flags, 'scale'),
        }) as never,
      );
    }
    if (command === 'array') {
      return room.array(
        pick({
          id: need(rest[1], 'node array 需要 nodeId'),
          count: num(flags, 'count'),
          offset: vec(flags, 'offset'),
          jitter: vec(flags, 'jitter'),
          rotateStep: vec(flags, 'rotate-step'),
        }) as never,
      );
    }
    if (command === 'merge') {
      return room.mergeNodes({
        nodeId: need(rest[1], 'node merge 需要 nodeId'),
        material: str(flags, 'material'),
      } as never);
    }
    if (command === 'group') {
      const ids = str(flags, 'ids')?.split(',');
      return room.group({
        ids: ids ?? [],
        name: need(str(flags, 'name'), 'node group 需要 --name'),
        keepWorld: flags['no-keep-world'] === true ? false : undefined,
      } as never);
    }
  }

  if (group === 'material' && command === 'assign') {
    return room.assignMaterial(
      pick({
        ids: str(flags, 'ids')?.split(','),
        filter: jsonArg(str(flags, 'filter')),
        materialId: need(str(flags, 'material'), 'material assign 需要 --material'),
      }) as never,
    );
  }

  if (group === 'material' && command === 'create') {
    return room.createMaterial({
      preset: need(str(flags, 'preset'), 'material create 需要 --preset'),
      params: jsonArg(str(flags, 'params')),
    } as never);
  }

  if (group === 'material' && command === 'patch') {
    return room.patchMaterial({
      materialId: need(rest[1], 'material patch 需要 materialId'),
      patch: materialPatchFromFlags(flags),
    } as never);
  }

  if (group === 'material' && command === 'map') {
    return room.mapMaterial(
      pick({
        materialId: need(rest[1], 'material map 需要 materialId'),
        ...mapFromFlags(flags),
      }) as never,
    );
  }

  if (group === 'decal' && command === 'create') {
    return room.createDecal(decalFromFlags(flags) as never);
  }

  if (group === 'mesh' && command === 'boolean') {
    return room.booleanMesh({
      target: need(rest[1], 'mesh boolean 需要 target'),
      tool: need(rest[2], 'mesh boolean 需要 tool'),
      ...booleanFromFlags(flags),
    } as never);
  }

  if (group === 'mesh' && command === 'tube') {
    return room.tubeMesh(tubeFromFlags(flags) as never);
  }

  if (group === 'mesh' && command === 'backdrop') {
    return room.backdropMesh(backdropFromFlags(flags) as never);
  }

  if (group === 'stage' && command === 'set') {
    const preset = str(flags, 'preset');
    const stage = jsonArg(str(flags, 'stage'));
    return room.setStage({ stage: (stage ?? (preset ? { preset } : undefined)) as never });
  }

  if (group === 'anim' && command === 'play') {
    return room.play({
      nodeId: need(rest[1], 'anim play 需要 nodeId'),
      ...playOptsFromFlags(flags),
    } as never);
  }

  if (group === 'anim' && command === 'define') {
    return room.defineAnimation({
      nodeId: need(rest[1], 'anim define 需要 nodeId'),
      clip: clipFromFlags(flags),
      applyTo: applyToFromFlags(flags),
    });
  }

  if (group === 'anim' && command === 'clear') {
    return room.clearAnimation(need(rest[1], 'anim clear 需要 nodeId'), {
      applyTo: applyToFromFlags(flags),
    });
  }

  if (group === 'fx' && command === 'create') {
    return room.createFx(fxSpecFromFlags(flags));
  }

  if (group === 'fx' && (command === 'rm' || command === 'delete')) {
    return room.deleteFx(need(rest[1], 'fx rm 需要 fxId'));
  }

  if (group === 'env' && command === 'set') {
    return room.setEnv({
      ...fogFromFlags(flags),
      ...(str(flags, 'hdri') ? { hdriSrc: str(flags, 'hdri') } : {}),
      ...(str(flags, 'policy') ? { policy: str(flags, 'policy') as never } : {}),
    });
  }

  if (
    group === 'camera' &&
    (command === 'set' || command === 'save' || command === 'rm' || command === 'delete')
  ) {
    const parsed = cameraFromFlags(flags);
    if (command === 'set') return room.setCamera(parsed);
    if (command === 'save') return room.saveCamera({ ...parsed, name: saveNameFrom(parsed.name) });
    const name = saveNameFrom(rest[1] ?? parsed.name);
    return room.deleteCamera(name);
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
      ...parseLookFlags(flags),
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

  if (group === 'render' && command === 'views') {
    const size = parseSize(str(flags, 'size'));
    const list = (value: string | undefined): string[] | undefined => {
      if (!value) return undefined;
      const items = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length > 0 ? items : undefined;
    };
    const nodeIds = [...(list(str(flags, 'node')) ?? []), ...(list(str(flags, 'nodes')) ?? [])];
    const shots = await room.views({
      views: list(str(flags, 'views')) as never,
      nodeIds: nodeIds.length > 0 ? (nodeIds as never) : undefined,
      width: size?.width,
      height: size?.height,
      format: str(flags, 'format') as never,
      settleMs: num(flags, 'settle-ms'),
      at: num(flags, 'at'),
      transparent: bool(flags, 'transparent') ? true : undefined,
      ...parseLookFlags(flags),
    });
    const out = str(flags, 'out');
    if (!out) {
      return {
        revision: shots.revision,
        target: shots.target,
        views: shots.shots.map((shot) => ({
          view: shot.view,
          label: shot.label,
          mime: shot.mime,
          bytes: shot.bytes.toString('base64'),
          width: shot.width,
          height: shot.height,
          camera: shot.camera,
        })),
      };
    }
    const dir = resolve(out);
    await mkdir(dir, { recursive: true });
    const files = [];
    for (const shot of shots.shots) {
      const path = join(dir, `${shot.view}.${shot.mime === 'image/jpeg' ? 'jpg' : 'png'}`);
      await writeFile(path, shot.bytes);
      files.push({ view: shot.view, label: shot.label, path, bytes: shot.bytes.length });
    }
    return { revision: shots.revision, target: shots.target, dir, files };
  }

  if (group === 'render' && command === 'node') {
    const nodeId = need(rest[1], 'render node 需要 nodeId');
    const size = parseSize(str(flags, 'size'));
    const shot = await room.closeup(nodeId, {
      view: str(flags, 'view') as never,
      padding: num(flags, 'padding'),
      width: size?.width,
      height: size?.height,
      format: str(flags, 'format') as never,
      settleMs: num(flags, 'settle-ms'),
      at: num(flags, 'at'),
      transparent: bool(flags, 'transparent') ? true : undefined,
      ...parseLookFlags(flags),
    });
    const out = str(flags, 'out');
    if (!out) return { ...shot, bytes: shot.bytes.toString('base64') };
    const path = resolve(out);
    await writeFile(path, shot.bytes);
    return {
      path,
      nodeId: shot.nodeId,
      target: shot.target,
      bytes: shot.bytes.length,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      revision: shot.revision,
    };
  }

  if (group === 'render' && command === 'pick') {
    const size = parseSize(str(flags, 'size'));
    const rawPoints = [str(flags, 'points'), str(flags, 'point')].filter(Boolean).join(';');
    const points = rawPoints
      .split(/[;\s]+/)
      .filter(Boolean)
      .map((pair) => {
        const [x, y] = pair.split(',').map((item) => Number(item.trim()));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`取样点格式应为 x,y：${pair}`);
        }
        return { x: x as number, y: y as number };
      });
    const rawRect = str(flags, 'rect');
    const rect = rawRect
      ? (() => {
          const values = rawRect.split(',').map((item) => Number(item.trim()));
          const [x, y, w, h] = values;
          if (values.length !== 4 || ![x, y, w, h].every((v) => Number.isFinite(v))) {
            throw new Error(`取样区域格式应为 x,y,w,h：${rawRect}`);
          }
          return { x: x as number, y: y as number, w: w as number, h: h as number };
        })()
      : undefined;
    return room.pick({
      points: points.length > 0 ? (points as never) : undefined,
      rect: rect as never,
      topColors: num(flags, 'top-colors'),
      width: size?.width,
      height: size?.height,
      settleMs: num(flags, 'settle-ms'),
      at: num(flags, 'at'),
      transparent: bool(flags, 'transparent') ? true : undefined,
      ...parseLookFlags(flags),
    });
  }

  if (group === 'export' && command === 'glb') {
    const node = str(flags, 'node');
    const handle = await room.exportGlbJob(pick({ nodeIds: node ? ([node] as never) : undefined }));
    if (flags.wait === false) return handle.get();
    const timeout = num(flags, 'timeout');
    const job = await handle.wait({ timeoutMs: timeout ? timeout * 1000 : undefined });
    const dest = str(flags, 'out');
    if (!dest || !job.url) return job;
    const res = await fetch(new URL(job.url, studio.url));
    if (!res.ok) throw new Error(`下载 GLB 失败：HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const path = resolve(dest);
    await writeFile(path, bytes);
    return {
      path,
      bytes: bytes.length,
      jobId: job.jobId,
      url: job.url,
      revision: job.revision,
    };
  }

  if (group === 'job') {
    if (command === 'ls' || command === 'list') {
      const roomId = rest[0] ?? str(flags, 'room');
      return studio.client.call('job.list', roomId ? { roomId } : {});
    }
    const jobId = need(rest[0], `job ${command ?? ''} 需要 <jobId>`);
    if (command === 'get') return studio.job(jobId).get();
    if (command === 'cancel') return studio.job(jobId).cancel();
    if (command === 'wait') {
      const timeout = num(flags, 'timeout');
      return studio.job(jobId).wait({ timeoutMs: timeout ? timeout * 1000 : undefined });
    }
    throw new Error(`未知 job 子命令：${command ?? '(空)'}`);
  }

  if (group === 'open') {
    return room.open(pick({ focus: str(flags, 'focus'), reuse: flags.reuse !== false }));
  }

  if (group === 'model' && command === 'import') {
    return room.importNode(
      pick({
        src: need(rest[1], 'model import 需要 <src>'),
        name: str(flags, 'name'),
        align: str(flags, 'align') as 'ground' | 'center' | 'none' | undefined,
        autoplay: bool(flags, 'autoplay'),
        policy: str(flags, 'policy'),
      }) as never,
    );
  }

  if (group === 'asset') {
    if (command === 'inspect') {
      return room.inspect({
        src: need(rest[1], 'asset inspect 需要 <src>'),
        policy: str(flags, 'policy'),
      } as never);
    }
    if (command === 'put') {
      return room.putAsset(
        pick({
          src: need(rest[1], 'asset put 需要 <src>'),
          kind: str(flags, 'kind'),
          name: str(flags, 'name'),
          policy: str(flags, 'policy'),
        }) as never,
      );
    }
    if (command === 'ls' || command === 'list') return room.listAssets();
    if (command === 'rm' || command === 'delete') {
      return room.deleteAsset(need(rest[1], 'asset rm 需要 <sha>'));
    }
    throw new Error(`未知 asset 子命令：${command ?? '(空)'}`);
  }

  throw new Error(`未知命令：${parsed._.join(' ')}（运行 vibe3d help）`);
}
