import type { CAPABILITIES, CapabilityName } from '@vibebyte/vibe3d-capabilities';
import type { z } from 'zod';
import { JobHandle } from './jobs';
import type { CallOptions, Transport } from './transport';

type Spec<K extends CapabilityName> = (typeof CAPABILITIES)[K];
export type CapParams<K extends CapabilityName> = z.input<Spec<K>['input']>;
export type CapResult<K extends CapabilityName> = z.output<Spec<K>['output']>;

function defined<T extends Record<string, unknown>>(params: T): T {
  for (const key of Object.keys(params)) if (params[key] === undefined) delete params[key];
  return params;
}

export interface RoomInfo {
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  roomId: string;
  nodeCount: number;
}

export interface SnapshotOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  settleMs?: number;
  at?: number;
  transparent?: boolean;
  shading?: CapParams<'render.snapshot'>['shading'];
  overlay?: CapParams<'render.snapshot'>['overlay'];
}

export interface ViewRequest extends SnapshotOptions {
  views?: CapParams<'render.views'>['views'];
  nodeIds?: string[];
}

export interface NodeShotRequest extends SnapshotOptions {
  view?: CapParams<'render.node'>['view'];
  padding?: number;
}

export interface PickRequest {
  points?: CapParams<'render.pick'>['points'];
  rect?: CapParams<'render.pick'>['rect'];
  topColors?: CapParams<'render.pick'>['topColors'];
  width?: number;
  height?: number;
  settleMs?: number;
  at?: number;
  transparent?: boolean;
  shading?: CapParams<'render.pick'>['shading'];
  overlay?: CapParams<'render.pick'>['overlay'];
}

export interface ViewShot {
  view: NonNullable<CapParams<'render.views'>['views']>[number];
  label: string;
  mime: string;
  bytes: Buffer;
  width: number;
  height: number;
  camera: CapResult<'render.views'>['views'][number]['camera'];
}

export class RoomHandle {
  readonly id: string;
  private readonly client: Transport;

  constructor(client: Transport, id: string) {
    this.client = client;
    this.id = id;
  }

  invoke<K extends CapabilityName>(
    method: K,
    params: Omit<CapParams<K>, 'roomId'> = {} as Omit<CapParams<K>, 'roomId'>,
    opts: CallOptions = {},
  ): Promise<CapResult<K>> {
    return this.client.call<CapResult<K>>(
      method,
      { ...(params as Record<string, unknown>), roomId: this.id },
      { ...opts, roomId: this.id },
    );
  }

  info(): Promise<RoomInfo> {
    return this.invoke('room.get');
  }

  get(): Promise<CapResult<'scene.get'>> {
    return this.invoke('scene.get');
  }

  summary(): Promise<CapResult<'scene.summary'>> {
    return this.invoke('scene.summary');
  }

  queryNodes(params: Omit<CapParams<'scene.query'>, 'roomId'> = {}): Promise<CapResult<'scene.query'>> {
    return this.invoke('scene.query', params);
  }

  getNode(nodeId: string): Promise<CapResult<'node.get'>> {
    return this.invoke('node.get', { nodeId });
  }

  stats(): Promise<CapResult<'scene.stats'>> {
    return this.invoke('scene.stats');
  }

  validate(params: Omit<CapParams<'scene.validate'>, 'roomId'> = {}): Promise<CapResult<'scene.validate'>> {
    return this.invoke('scene.validate', params);
  }

  transformMany(
    params: Omit<CapParams<'node.transform_many'>, 'roomId'>,
  ): Promise<CapResult<'node.transform_many'>> {
    return this.invoke('node.transform_many', params);
  }

  array(params: Omit<CapParams<'node.array'>, 'roomId'>): Promise<CapResult<'node.array'>> {
    return this.invoke('node.array', params);
  }

  group(params: Omit<CapParams<'node.group'>, 'roomId'>): Promise<CapResult<'node.group'>> {
    return this.invoke('node.group', params);
  }

  assignMaterial(
    params: Omit<CapParams<'material.assign'>, 'roomId'>,
  ): Promise<CapResult<'material.assign'>> {
    return this.invoke('material.assign', params);
  }

  apply(
    ops: CapParams<'ops.apply'>['ops'],
    opts: { dryRun?: boolean } & CallOptions = {},
  ): Promise<CapResult<'ops.apply'>> {
    return this.invoke('ops.apply', { ops, dryRun: opts.dryRun }, opts);
  }

  createNode(params: Omit<CapParams<'node.create'>, 'roomId'>): Promise<CapResult<'node.create'>> {
    return this.invoke('node.create', params);
  }

  updateNode(params: Omit<CapParams<'node.update'>, 'roomId'>): Promise<CapResult<'node.update'>> {
    return this.invoke('node.update', params);
  }

  deleteNode(params: Omit<CapParams<'node.delete'>, 'roomId'>): Promise<CapResult<'node.delete'>> {
    return this.invoke('node.delete', params);
  }

  cloneNode(params: Omit<CapParams<'node.clone'>, 'roomId'>): Promise<CapResult<'node.clone'>> {
    return this.invoke('node.clone', params);
  }

  setStage(params: Omit<CapParams<'stage.set'>, 'roomId'>): Promise<CapResult<'stage.set'>> {
    return this.invoke('stage.set', params);
  }

  play(params: Omit<CapParams<'animation.play'>, 'roomId'>): Promise<CapResult<'animation.play'>> {
    return this.invoke('animation.play', params);
  }

  defineAnimation(
    params: Omit<CapParams<'animation.define'>, 'roomId'>,
  ): Promise<CapResult<'animation.define'>> {
    return this.invoke('animation.define', params);
  }

  clearAnimation(nodeId: string): Promise<CapResult<'animation.clear'>> {
    return this.invoke('animation.clear', { nodeId });
  }

  createFx(params: Omit<CapParams<'fx.create'>, 'roomId'>): Promise<CapResult<'fx.create'>> {
    return this.invoke('fx.create', params);
  }

  deleteFx(fxId: string): Promise<CapResult<'fx.delete'>> {
    return this.invoke('fx.delete', { fxId });
  }

  setEnv(params: Omit<CapParams<'env.set'>, 'roomId'>): Promise<CapResult<'env.set'>> {
    return this.invoke('env.set', params);
  }

  undo(): Promise<CapResult<'scene.undo'>> {
    return this.invoke('scene.undo');
  }

  redo(): Promise<CapResult<'scene.redo'>> {
    return this.invoke('scene.redo');
  }

  diff(params: Omit<CapParams<'scene.diff'>, 'roomId'> = {}): Promise<CapResult<'scene.diff'>> {
    return this.invoke('scene.diff', params);
  }

  selection(): Promise<CapResult<'selection.get'>> {
    return this.invoke('selection.get');
  }

  importNode(params: Omit<CapParams<'node.import'>, 'roomId'>): Promise<CapResult<'node.import'>> {
    return this.invoke('node.import', params);
  }

  inspect(params: Omit<CapParams<'asset.inspect'>, 'roomId'>): Promise<CapResult<'asset.inspect'>> {
    return this.invoke('asset.inspect', params);
  }

  putAsset(params: Omit<CapParams<'asset.put'>, 'roomId'>): Promise<CapResult<'asset.put'>> {
    return this.invoke('asset.put', params);
  }

  listAssets(): Promise<CapResult<'asset.list'>> {
    return this.invoke('asset.list');
  }

  deleteAsset(sha: string): Promise<CapResult<'asset.delete'>> {
    return this.invoke('asset.delete', { sha });
  }

  setCamera(params: Omit<CapParams<'camera.set'>, 'roomId'> = {}): Promise<CapResult<'camera.set'>> {
    return this.invoke('camera.set', params);
  }

  async snapshot(
    opts: SnapshotOptions = {},
  ): Promise<{ revision: number; mime: string; bytes: Buffer; width: number; height: number }> {
    const out = await this.invoke(
      'render.snapshot',
      defined({
        width: opts.width,
        height: opts.height,
        format: opts.format,
        settleMs: opts.settleMs,
        at: opts.at,
        transparent: opts.transparent,
        shading: opts.shading,
        overlay: opts.overlay,
      }),
    );
    return {
      revision: out.revision,
      mime: out.mime,
      bytes: Buffer.from(out.base64, 'base64'),
      width: out.width,
      height: out.height,
    };
  }

  async views(
    opts: ViewRequest = {},
  ): Promise<{ revision: number; target: CapResult<'render.views'>['target']; shots: ViewShot[] }> {
    const out = await this.invoke(
      'render.views',
      defined({
        views: opts.views,
        nodeIds: opts.nodeIds,
        width: opts.width,
        height: opts.height,
        format: opts.format,
        settleMs: opts.settleMs,
        at: opts.at,
        transparent: opts.transparent,
        shading: opts.shading,
        overlay: opts.overlay,
      }),
    );
    return {
      revision: out.revision,
      target: out.target,
      shots: out.views.map((v) => ({
        view: v.view,
        label: v.label,
        mime: v.mime,
        bytes: Buffer.from(v.base64, 'base64'),
        width: v.width,
        height: v.height,
        camera: v.camera,
      })),
    };
  }

  async closeup(
    nodeId: string,
    opts: NodeShotRequest = {},
  ): Promise<{
    revision: number;
    nodeId: string;
    target: CapResult<'render.node'>['target'];
    mime: string;
    bytes: Buffer;
    width: number;
    height: number;
    camera: CapResult<'render.node'>['camera'];
  }> {
    const out = await this.invoke(
      'render.node',
      defined({
        nodeId,
        view: opts.view,
        padding: opts.padding,
        width: opts.width,
        height: opts.height,
        format: opts.format,
        settleMs: opts.settleMs,
        at: opts.at,
        transparent: opts.transparent,
        shading: opts.shading,
        overlay: opts.overlay,
      }),
    );
    return {
      revision: out.revision,
      nodeId: out.nodeId,
      target: out.target,
      mime: out.mime,
      bytes: Buffer.from(out.base64, 'base64'),
      width: out.width,
      height: out.height,
      camera: out.camera,
    };
  }

  pick(opts: PickRequest = {}): Promise<CapResult<'render.pick'>> {
    return this.invoke(
      'render.pick',
      defined({
        points: opts.points,
        rect: opts.rect,
        topColors: opts.topColors,
        width: opts.width,
        height: opts.height,
        settleMs: opts.settleMs,
        at: opts.at,
        transparent: opts.transparent,
        shading: opts.shading,
        overlay: opts.overlay,
      }),
    );
  }

  exportGlb(params: Omit<CapParams<'export.glb'>, 'roomId'> = {}): Promise<CapResult<'export.glb'>> {
    return this.invoke('export.glb', params);
  }

  exportScene(): Promise<CapResult<'scene.export'>> {
    return this.invoke('scene.export');
  }

  importScene(params: Omit<CapParams<'scene.import'>, 'roomId'>): Promise<CapResult<'scene.import'>> {
    return this.invoke('scene.import', params);
  }

  checkpoint(
    params: Omit<CapParams<'scene.checkpoint'>, 'roomId'> = {},
  ): Promise<CapResult<'scene.checkpoint'>> {
    return this.invoke('scene.checkpoint', params);
  }

  checkpoints(): Promise<CapResult<'scene.checkpoints'>> {
    return this.invoke('scene.checkpoints');
  }

  restore(checkpointId: string): Promise<CapResult<'scene.restore'>> {
    return this.invoke('scene.restore', { checkpointId });
  }

  async exportGlbJob(params: Omit<CapParams<'export.glb'>, 'roomId'> = {}): Promise<JobHandle> {
    const out = await this.exportGlb(params);
    return new JobHandle(this.client, out.jobId);
  }

  job(jobId: string): JobHandle {
    return new JobHandle(this.client, jobId);
  }

  open(params: Omit<CapParams<'editor.open'>, 'roomId'> = {}): Promise<CapResult<'editor.open'>> {
    return this.invoke('editor.open', params);
  }
}
