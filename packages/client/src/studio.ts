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
import { RpcClient, type Transport } from './transport';

export interface StudioOptions extends ConnectOptions {
  autostart?: boolean;
}

const testEndpoint: RunRecord = {
  pid: 0,
  port: 0,
  host: '127.0.0.1',
  home: '/tmp/vibe3d-test',
  mode: 'test',
  token: 'test',
  version: 'test',
  startedAt: '1970-01-01T00:00:00.000Z',
  file: '/tmp/vibe3d-test/run.json',
};

export class Studio {
  readonly endpoint: RunRecord;
  readonly client: Transport;
  readonly home: string;

  private constructor(endpoint: RunRecord, client: Transport) {
    this.endpoint = endpoint;
    this.client = client;
    this.home = endpoint.home;
  }

  /** 测试接缝：用给定传输构造 Studio，不发现、不启动 daemon。 */
  static over(transport: Transport, endpoint: Partial<RunRecord> = {}): Studio {
    return new Studio({ ...testEndpoint, ...endpoint }, transport);
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
