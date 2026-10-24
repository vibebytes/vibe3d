import type { AssetMeta, CameraState, GltfReport, SceneDoc } from '@vibebyte/vibe3d-protocol';
import type { JobQueue } from './jobs/queue';
import type { JobStore } from './jobs/store';
import type { RoomManager } from './rooms/manager';

export type AssetPolicy = 'strict' | 'local' | 'allow';

export type ShadingMode = 'flat' | 'wireframe' | 'normals';
export type OverlayKind = 'grid' | 'axes' | 'bbox';

export interface SnapshotOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  settleMs?: number;
  at?: number;
  transparent?: boolean;
  camera?: CameraState;
  shading?: ShadingMode;
  overlay?: OverlayKind[];
  highlight?: string[];
  isolate?: string[];
}

export interface Snapshot {
  mime: string;
  base64: string;
  width: number;
  height: number;
}

export interface RenderInput {
  roomId: string;
  doc: SceneDoc;
}

export interface Renderer {
  readonly name: string;
  readonly ready: boolean;
  available?(roomId: string): boolean;
  snapshot(input: RenderInput, opts: SnapshotOptions): Promise<Snapshot>;
  exportGlb(
    input: RenderInput,
    nodeIds?: string[],
    include?: Array<'cameras' | 'lights'>,
  ): Promise<{ jobId: string; url: string; bytes: number }>;
  close?(): Promise<void>;
}

export interface IngestResult {
  meta: AssetMeta;
  report?: GltfReport;
  cached: boolean;
}

export interface Jobs {
  store: JobStore;
  queue: JobQueue;
}

export type AutoOpenState = 'pending' | 'opened' | 'failed';

export interface DispatchContext {
  rooms: RoomManager;
  baseUrl: string;
  token?: string;
  renderer?: Renderer;
  jobs?: Jobs;
  exportsDir?: string;
  signExport?: (file: string) => string;
  ingest: (src: string, policy?: AssetPolicy, opts?: { maxBytes?: number }) => Promise<IngestResult>;
  inspect: (
    src: string,
    policy?: AssetPolicy,
  ) => Promise<{ sha: string; cached: boolean; report: GltfReport }>;
  selection: (roomId: string) => string[];
  surfaces?: (roomId: string) => number;
  openExternal?: (url: string) => boolean | Promise<boolean>;
  autoOpen?: Map<string, AutoOpenState>;
}

export interface HelloResult {
  protocolVersion: string;
  daemonVersion: string;
  renderer: string;
  capabilities: string[];
}
