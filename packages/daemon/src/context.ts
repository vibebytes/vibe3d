import type { AssetMeta, CameraState, GltfReport, SceneDoc } from '@vibebyte/vibe3d-protocol';
import type { FogMode, QualityPreset, ShotMeta } from '@vibebyte/vibe3d-scene';
import type { JobQueue } from './jobs/queue';
import type { JobStore } from './jobs/store';
import type { Logger } from './logger';
import type { RoomManager } from './rooms/manager';
import type { ThumbsStore } from './thumbs';

export type AssetPolicy = 'strict' | 'local' | 'allow';

export type ShadingMode = 'flat' | 'wireframe' | 'normals' | 'material' | 'rendered';
export type OverlayKind = 'grid' | 'axes' | 'bbox' | 'ground' | 'centerline' | 'scale' | 'normal' | 'dims';

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
  quality?: QualityPreset;
  fog?: FogMode;
}

export interface Snapshot {
  mime: string;
  base64: string;
  width: number;
  height: number;
  meta?: ShotMeta;
}

export interface IdPassOptions {
  width: number;
  height: number;
  camera?: CameraState;
  settleMs?: number;
  at?: number;
  legend: Record<string, string>;
}

export interface IdPassShot {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface ProjectRequest {
  camera: CameraState;
  width: number;
  height: number;
  points: Array<[number, number, number]>;
}

export interface UnprojectRequest {
  camera: CameraState;
  width: number;
  height: number;
  points: Array<[number, number]>;
  depth: number[];
}

export interface ProjectShot {
  width: number;
  height: number;
  camera: CameraState;
  points: Array<{ px: [number, number]; depth: number; in_view: boolean }>;
}

export interface UnprojectShot {
  width: number;
  height: number;
  camera: CameraState;
  points: Array<{ p: [number, number, number]; in_view: boolean }>;
}

export interface RenderInput {
  roomId: string;
  doc: SceneDoc;
}

export interface Renderer {
  readonly name: string;
  readonly ready: boolean;
  available?(roomId: string): boolean;
  warm?(roomId: string): Promise<void>;
  drop?(roomId: string): Promise<void>;
  snapshot(input: RenderInput, opts: SnapshotOptions): Promise<Snapshot>;
  idPass?(input: RenderInput, opts: IdPassOptions): Promise<IdPassShot>;
  project?(input: RenderInput, opts: ProjectRequest): Promise<ProjectShot>;
  unproject?(input: RenderInput, opts: UnprojectRequest): Promise<UnprojectShot>;
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
  ingest: (
    src: string,
    policy?: AssetPolicy,
    opts?: { maxBytes?: number; hdri?: boolean },
  ) => Promise<IngestResult>;
  inspect: (
    src: string,
    policy?: AssetPolicy,
  ) => Promise<{ sha: string; cached: boolean; report: GltfReport }>;
  selection: (roomId: string) => string[];
  surfaces?: (roomId: string) => number;
  openExternal?: (open: { url: string; roomId?: string }) => boolean | Promise<boolean>;
  thumbs?: ThumbsStore;
  autoOpen?: Map<string, AutoOpenState>;
  logger?: Logger;
}

export interface HelloResult {
  protocolVersion: string;
  daemonVersion: string;
  renderer: string;
  capabilities: string[];
}
