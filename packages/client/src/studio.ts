import {
  type ConnectOptions,
  type RunRecord,
  connect,
  defaultHome,
  findRunning,
  startDaemon,
} from './discovery';
import { JobHandle } from './jobs';
import type { CapParams, CapResult } from './room';
import { RoomHandle } from './room';
import { RpcClient } from './transport';

export interface StudioOptions extends ConnectOptions {
  autostart?: boolean;
}

export class Studio {
  readonly endpoint: RunRecord;
  readonly client: RpcClient;
  readonly home: string;

  private constructor(endpoint: RunRecord, client: RpcClient) {
    this.endpoint = endpoint;
    this.client = client;
    this.home = endpoint.home;
  }

  static async connect(opts: StudioOptions = {}): Promise<Studio> {
    const { client, ...endpoint } = await connect(opts);
    return new Studio(endpoint, client);
  }

  static async attach(home = defaultHome()): Promise<Studio> {
    const run = await findRunning(home);
    if (!run) throw new Error(`没有运行中的 daemon（home=${home}）`);
    return new Studio(run, new RpcClient({ url: `http://${run.host}:${run.port}`, token: run.token }));
  }

  static async start(opts: StudioOptions = {}): Promise<Studio> {
    const run = await startDaemon(opts);
    return new Studio(run, new RpcClient({ url: `http://${run.host}:${run.port}`, token: run.token }));
  }

  get url(): string {
    return `http://${this.endpoint.host}:${this.endpoint.port}`;
  }

  get editorUrl(): string {
    return `${this.url}/?t=${this.endpoint.token}`;
  }

  hello(): Promise<{
    protocolVersion: string;
    daemonVersion: string;
    renderer: string;
    capabilities: string[];
  }> {
    return this.client.call('hello');
  }

  health(): Promise<{
    ok: boolean;
    version: string;
    protocolVersion: string;
    rooms: number;
    renderer: string;
  }> {
    return this.client.health();
  }

  async listRooms(): Promise<CapResult<'room.list'>['rooms']> {
    const out = await this.client.call<CapResult<'room.list'>>('room.list');
    return out.rooms;
  }

  async createRoom(opts: CapParams<'room.create'> = {}): Promise<RoomHandle> {
    const out = await this.client.call<CapResult<'room.create'>>(
      'room.create',
      opts as Record<string, unknown>,
    );
    return new RoomHandle(this.client, out.roomId);
  }

  room(roomId: string): RoomHandle {
    return new RoomHandle(this.client, roomId);
  }

  job(jobId: string): JobHandle {
    return new JobHandle(this.client, jobId);
  }

  async closeRoom(roomId: string, purge = false): Promise<CapResult<'room.close'>> {
    return this.client.call('room.close', { roomId, purge }, { roomId });
  }
}
