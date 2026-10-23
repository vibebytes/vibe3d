import type { CAPABILITIES, CapabilityName } from '@vibebyte/vibe3d-capabilities';
import type { z } from 'zod';
import type { CallOptions, Transport } from './transport';

type Spec<K extends CapabilityName> = (typeof CAPABILITIES)[K];
export type CapParams<K extends CapabilityName> = z.input<Spec<K>['input']>;
export type CapResult<K extends CapabilityName> = z.output<Spec<K>['output']>;

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

  setStage(params: Omit<CapParams<'stage.set'>, 'roomId'>): Promise<CapResult<'stage.set'>> {
    return this.invoke('stage.set', params);
  }

  play(params: Omit<CapParams<'animation.play'>, 'roomId'>): Promise<CapResult<'animation.play'>> {
    return this.invoke('animation.play', params);
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

  setCamera(params: Omit<CapParams<'camera.set'>, 'roomId'> = {}): Promise<CapResult<'camera.set'>> {
    return this.invoke('camera.set', params);
  }

  async snapshot(
    opts: SnapshotOptions = {},
  ): Promise<{ revision: number; mime: string; bytes: Buffer; width: number; height: number }> {
    const out = await this.invoke('render.snapshot', {
      width: opts.width,
      height: opts.height,
      format: opts.format,
      settleMs: opts.settleMs,
    });
    return {
      revision: out.revision,
      mime: out.mime,
      bytes: Buffer.from(out.base64, 'base64'),
      width: out.width,
      height: out.height,
    };
  }

  exportGlb(params: Omit<CapParams<'export.glb'>, 'roomId'> = {}): Promise<CapResult<'export.glb'>> {
    return this.invoke('export.glb', params);
  }

  open(params: Omit<CapParams<'editor.open'>, 'roomId'> = {}): Promise<CapResult<'editor.open'>> {
    return this.invoke('editor.open', params);
  }
}
