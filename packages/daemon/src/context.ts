import type { AssetMeta, GltfReport, SceneDoc } from '@vibebyte/vibe3d-protocol';
import type { RoomManager } from './rooms/manager';

export type AssetPolicy = 'strict' | 'local' | 'allow';

export interface SnapshotOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  settleMs?: number;
  at?: number;
  transparent?: boolean;
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
  exportGlb(input: RenderInput, nodeIds?: string[]): Promise<{ jobId: string; url: string; bytes: number }>;
  close?(): Promise<void>;
}

export interface IngestResult {
  meta: AssetMeta;
  report: GltfReport;
  cached: boolean;
}

export interface DispatchContext {
  rooms: RoomManager;
  baseUrl: string;
  token?: string;
  renderer?: Renderer;
  ingest: (src: string, policy?: AssetPolicy) => Promise<IngestResult>;
  inspect: (
    src: string,
    policy?: AssetPolicy,
  ) => Promise<{ sha: string; cached: boolean; report: GltfReport }>;
  selection: (roomId: string) => string[];
  surfaces?: (roomId: string) => number;
}

export interface HelloResult {
  protocolVersion: string;
  daemonVersion: string;
  renderer: string;
  capabilities: string[];
}
