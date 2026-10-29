import type {
  CameraState,
  ClipSpec,
  Fog,
  FxSpec,
  MapTransform,
  Material,
  MaterialPreset,
  Npr,
  Post,
  SceneDoc,
  StageState,
} from '@vibebyte/vibe3d-protocol';
import { create } from 'zustand';
import { splitFiles } from '../lib/asset-files';
import { fitTransform, importName, isGltfFile, rowOffset } from '../lib/import-model';
import { rpc } from '../lib/rpc';
import { base64ToBytes, fitsMaxBytes, shrinkCapture, uploadSnapshot } from '../lib/snapshot-upload';
import { uploadGltf, uploadImage } from '../lib/upload';
import { type RoomSocket, connectRoom } from '../lib/ws';
import type {
  CaptureOptions,
  CaptureResult,
  FogMode,
  IdPassOptions,
  IdPassResult,
  OverlayKind,
  ShadingMode,
} from '../viewport/CaptureBridge';
import { useConn } from './conn';
import { useSelection } from './selection';
import { parseSnapshotCamera } from './snapshot-camera';
import { useUi } from './ui';

const SHADING_MODES: readonly ShadingMode[] = ['flat', 'wireframe', 'normals', 'material', 'rendered'];
const FOG_MODES: readonly FogMode[] = ['doc', 'off', 'auto'];
const OVERLAY_KINDS: readonly OverlayKind[] = [
  'grid',
  'axes',
  'bbox',
  'ground',
  'centerline',
  'scale',
  'normal',
  'dims',
];

export type CameraPreset = 'miniature_45';

export type StagePatch = Partial<Omit<StageState, 'npr' | 'post'>> & {
  npr?: Npr | null;
  post?: Post | null;
};

declare global {
  interface Window {
    __vibe3dCapture?: (opts?: CaptureOptions) => CaptureResult | null;
    __vibe3dReady?: boolean;
    __vibe3dRevision?: number;
    __vibe3dExport?: (nodeIds?: string[] | null) => Promise<string>;
    __vibe3dIdPass?: (opts: IdPassOptions) => IdPassResult;
    __vibe3dProject?: (opts: {
      camera: CameraState;
      width: number;
      height: number;
      points: Array<[number, number, number]>;
    }) => { points: Array<{ px: [number, number]; depth: number; in_view: boolean }> } | null;
    __vibe3dUnproject?: (opts: {
      camera: CameraState;
      width: number;
      height: number;
      points: Array<[number, number]>;
      depth: number[];
    }) => { points: Array<{ p: [number, number, number]; in_view: boolean }> } | null;
    vibe3d?: {
      roomId: string;
      select(id: string | null): void;
      capture(opts?: CaptureOptions): CaptureResult | null;
      exportGlb(nodeIds?: string[] | null): Promise<string>;
    };
  }
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface ImportProgress {
  name: string;
  index: number;
  total: number;
  ratio: number;
}

export interface ImportedModel {
  nodeId: string;
  name: string;
  sha: string;
  bytes: number;
}

export interface ImportOutcome {
  imported: ImportedModel[];
  failed: { name: string; message: string }[];
}

export interface UploadedImage {
  sha: string;
  name: string;
  bytes: number;
}

export interface ImageOutcome {
  uploaded: UploadedImage[];
  failed: { name: string; message: string }[];
}

interface DocStore {
  roomId: string;
  doc: SceneDoc | null;
  status: Status;
  error: string | null;
  online: boolean;
  importing: ImportProgress | null;
  socket: RoomSocket | null;
  load(roomId: string): Promise<void>;
  refresh(): Promise<void>;
  createNode(kind: 'box' | 'sphere' | 'cylinder' | 'light'): Promise<void>;
  importModels(files: File[]): Promise<ImportOutcome>;
  uploadImages(files: File[]): Promise<ImageOutcome>;
  ingestFiles(files: File[]): Promise<{ models: ImportOutcome; images: ImageOutcome; rejected: string[] }>;
  patchNode(id: string, patch: Record<string, unknown>): Promise<void>;
  patchMaterial(id: string, material: Material): Promise<void>;
  mapMaterial(id: string, map: Partial<MapTransform>): Promise<void>;
  createMaterial(preset: MaterialPreset): Promise<string | null>;
  removeNode(id: string): Promise<void>;
  setStage(stage: StagePatch): Promise<void>;
  setEnv(env: Partial<SceneDoc['env']>): Promise<void>;
  setCamera(camera: CameraState): Promise<void>;
  frameCamera(mode: 'fit' | 'close' | 'wide'): Promise<void>;
  saveCamera(name: string): Promise<void>;
  deleteCamera(name: string): Promise<void>;
  useCamera(name: string): Promise<void>;
  applyCameraPreset(preset: CameraPreset): Promise<void>;
  playAnimation(id: string, opts?: { clip?: string; speed?: number }): Promise<void>;
  stopAnimation(id: string): Promise<void>;
  defineAnimation(id: string, clip: ClipSpec): Promise<void>;
  clearAnimation(id: string): Promise<void>;
  createFx(spec: Omit<FxSpec, 'id'>): Promise<string | null>;
  deleteFx(fxId: string): Promise<void>;
  setFog(fog: Fog | null): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  dispose(): void;
}

export const useDoc = create<DocStore>((set, get) => ({
  roomId: '',
  doc: null,
  status: 'idle',
  error: null,
  online: false,
  importing: null,
  socket: null,

  async load(roomId) {
    get().socket?.close();
    useSelection.getState().reset();
    useConn.getState().setStatus('connecting');
    set({ roomId, status: 'loading', error: null, doc: null });
    try {
      const { doc } = await rpc<{ doc: SceneDoc }>('scene.get', {}, roomId);
      set({ doc, status: 'ready' });
      const socket = connectRoom(
        roomId,
        async (evt) => {
          if (evt.event === 'scene.changed') void get().refresh();
          if (evt.event === 'snapshot.request') {
            const requestId = typeof evt.data.requestId === 'string' ? evt.data.requestId : null;
            if (!requestId) return;
            const num = (key: string): number | undefined => {
              const value = evt.data[key];
              return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
            };
            const shading = SHADING_MODES.find((mode) => mode === evt.data.shading);
            const fog = FOG_MODES.find((mode) => mode === evt.data.fog);
            const overlay = Array.isArray(evt.data.overlay)
              ? evt.data.overlay.filter((k): k is OverlayKind => OVERLAY_KINDS.some((kind) => kind === k))
              : undefined;
            const ids = (key: string): string[] | undefined => {
              const value = evt.data[key];
              return Array.isArray(value)
                ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : undefined;
            };
            const highlight = ids('highlight');
            const isolate = ids('isolate');
            try {
              const maxBytes = num('maxBytes');
              const base = {
                format: evt.data.format === 'jpeg' ? ('jpeg' as const) : ('png' as const),
                at: num('at'),
                transparent: evt.data.transparent === true,
                camera: parseSnapshotCamera(evt.data.camera),
                shading,
                fog,
                overlay: overlay && overlay.length > 0 ? overlay : undefined,
                highlight: highlight && highlight.length > 0 ? highlight : undefined,
                isolate: isolate && isolate.length > 0 ? isolate : undefined,
              };
              let shot = window.__vibe3dCapture?.({
                ...base,
                width: num('width'),
                height: num('height'),
              });
              for (let attempt = 0; attempt < 2 && shot; attempt += 1) {
                if (fitsMaxBytes(shot.base64.length, maxBytes)) break;
                const smaller = shrinkCapture(shot.width, shot.height);
                shot = window.__vibe3dCapture?.({
                  ...base,
                  width: smaller.width,
                  height: smaller.height,
                });
              }
              if (!shot) {
                get().socket?.send({ type: 'snapshot.result', requestId, error: 'capture unavailable' });
                return;
              }
              if (!fitsMaxBytes(shot.base64.length, maxBytes)) {
                get().socket?.send({
                  type: 'snapshot.result',
                  requestId,
                  error: 'snapshot 超出大小预算',
                  code: 'E_SNAPSHOT_TOO_LARGE',
                  bytes: shot.base64.length,
                });
                return;
              }
              const mime = shot.mime || (base.format === 'jpeg' ? 'image/jpeg' : 'image/png');
              const bytes = await uploadSnapshot(
                roomId,
                requestId,
                base64ToBytes(shot.base64),
                mime,
                shot.meta,
              );
              get().socket?.send({
                type: 'snapshot.result',
                requestId,
                uploaded: true,
                mime,
                width: shot.width,
                height: shot.height,
                bytes,
                meta: shot.meta,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              get().socket?.send({ type: 'snapshot.result', requestId, error: message });
            }
          }
          if (evt.event === 'idpass.request') {
            const requestId = typeof evt.data.requestId === 'string' ? evt.data.requestId : null;
            if (!requestId) return;
            const legend = evt.data.legend;
            if (!legend || typeof legend !== 'object') {
              get().socket?.send({ type: 'idpass.result', requestId, error: 'legend 缺失' });
              return;
            }
            const num = (key: string): number | undefined => {
              const value = evt.data[key];
              return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
            };
            try {
              const shot = window.__vibe3dIdPass?.({
                width: num('width'),
                height: num('height'),
                at: num('at'),
                camera: parseSnapshotCamera(evt.data.camera),
                legend: legend as Record<string, string>,
              });
              if (!shot) {
                get().socket?.send({ type: 'idpass.result', requestId, error: 'id-pass unavailable' });
                return;
              }
              get().socket?.send({
                type: 'idpass.result',
                requestId,
                width: shot.width,
                height: shot.height,
                rgba: shot.rgba,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              get().socket?.send({ type: 'idpass.result', requestId, error: message });
            }
          }
        },
        (online) => {
          set({ online });
          if (online) useConn.getState().online();
          else useConn.getState().retry('websocket closed');
        },
      );
      set({ socket });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useConn.getState().fail(message);
      set({ status: 'error', error: message });
    }
  },

  async refresh() {
    const roomId = get().roomId;
    if (!roomId) return;
    try {
      const { doc } = await rpc<{ doc: SceneDoc }>('scene.get', {}, roomId);
      set({ doc, status: 'ready' });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async createNode(kind) {
    const roomId = get().roomId;
    if (!roomId) return;
    const base = { kind: kind === 'light' ? 'light' : 'mesh', name: kind } as Record<string, unknown>;
    if (kind === 'light')
      base.light = { type: 'point', color: [1, 1, 1, 1], intensity: 8, position: [0, 2, 0] };
    else base.shape = kind;
    const res = await rpc<{ nodeId: string }>('node.create', base, roomId);
    await get().refresh();
    useSelection.getState().select(res.nodeId);
  },

  async importModels(files) {
    const roomId = get().roomId;
    if (!roomId) throw new Error('房间尚未载入');
    const outcome: ImportOutcome = { imported: [], failed: [] };
    const list = files.filter((file) => {
      if (isGltfFile(file.name)) return true;
      outcome.failed.push({ name: file.name, message: '只支持 .glb / .gltf' });
      return false;
    });

    try {
      for (let i = 0; i < list.length; i += 1) {
        const file = list[i];
        if (!file) continue;
        const name = importName(file.name);
        const progress = (ratio: number): void => {
          set({ importing: { name: file.name, index: i + 1, total: list.length, ratio } });
        };
        progress(0);
        try {
          const upload = await uploadGltf(roomId, file, (ratio) => progress(ratio * 0.85));
          const transform = fitTransform(upload.gltf.size, { offsetX: rowOffset(i, list.length) });
          const { nodeId } = await rpc<{ nodeId: string }>(
            'node.import',
            { sha: upload.sha, name, transform },
            roomId,
          );
          outcome.imported.push({ nodeId, name, sha: upload.sha, bytes: upload.bytes });
        } catch (err) {
          outcome.failed.push({
            name: file.name,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      set({ importing: null });
    }

    if (outcome.imported.length > 0) {
      await get().refresh();
      const last = outcome.imported[outcome.imported.length - 1];
      if (last) useSelection.getState().select(last.nodeId);
      await get().frameCamera('fit');
    }
    return outcome;
  },

  async uploadImages(files) {
    const roomId = get().roomId;
    if (!roomId) throw new Error('房间尚未载入');
    const outcome: ImageOutcome = { uploaded: [], failed: [] };
    for (const file of files) {
      try {
        const res = await uploadImage(roomId, file);
        outcome.uploaded.push({ sha: res.sha, name: res.meta.name || file.name, bytes: res.bytes });
      } catch (err) {
        outcome.failed.push({
          name: file.name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (outcome.uploaded.length > 0) await get().refresh();
    return outcome;
  },

  async ingestFiles(files) {
    const split = splitFiles(files);
    const models = split.models.length
      ? await get().importModels(split.models)
      : { imported: [], failed: [] };
    const images = split.images.length
      ? await get().uploadImages(split.images)
      : { uploaded: [], failed: [] };
    return { models, images, rejected: split.rejected.map((r) => `${r.name}：${r.reason}`) };
  },

  async patchNode(id, patch) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('node.update', { nodeId: id, patch }, roomId);
    await get().refresh();
  },

  async patchMaterial(id, material) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('ops.apply', { ops: [{ op: 'material.set', id, material }] }, roomId);
    await get().refresh();
  },

  async mapMaterial(id, map) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('ops.apply', { ops: [{ op: 'material.map', id, map }] }, roomId);
    await get().refresh();
  },

  async createMaterial(preset) {
    const roomId = get().roomId;
    if (!roomId) return null;
    const out = await rpc<{ materialId: string }>('material.create', { preset }, roomId);
    await get().refresh();
    return out.materialId;
  },

  async removeNode(id) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('node.delete', { nodeId: id }, roomId);
    useSelection.getState().reset();
    await get().refresh();
  },

  async setStage(stage) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('stage.set', { stage }, roomId);
    await get().refresh();
  },

  async setEnv(patch) {
    const roomId = get().roomId;
    const doc = get().doc;
    if (!roomId || !doc) return;
    const env: Omit<SceneDoc['env'], 'hdri'> & { hdri?: string | null } = { ...doc.env, ...patch };
    if ('hdri' in patch) env.hdri = patch.hdri ?? null;
    await rpc('ops.apply', { ops: [{ op: 'env.set', env }] }, roomId);
    await get().refresh();
  },

  async setCamera(camera) {
    const roomId = get().roomId;
    if (!roomId) return;
    useSelection.getState().reset();
    await rpc('camera.set', { camera }, roomId);
    await get().refresh();
  },

  async frameCamera(mode) {
    const roomId = get().roomId;
    if (!roomId) return;
    useSelection.getState().reset();
    await rpc('camera.set', { frame: mode }, roomId);
    await get().refresh();
  },

  async saveCamera(name) {
    const roomId = get().roomId;
    const doc = get().doc;
    if (!roomId || !doc) return;
    await rpc('camera.save', { name, camera: doc.camera }, roomId);
    await get().refresh();
  },

  async deleteCamera(name) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('camera.delete', { name }, roomId);
    await get().refresh();
  },

  async useCamera(name) {
    const roomId = get().roomId;
    if (!roomId) return;
    useSelection.getState().reset();
    useUi.getState().setLetterbox(true);
    await rpc('camera.set', { name }, roomId);
    await get().refresh();
  },

  async applyCameraPreset(preset) {
    const roomId = get().roomId;
    if (!roomId) return;
    useSelection.getState().reset();
    await rpc('camera.set', { preset }, roomId);
    await get().refresh();
  },

  async playAnimation(id, opts) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('animation.play', { nodeId: id, clip: opts?.clip, speed: opts?.speed }, roomId);
    await get().refresh();
  },

  async stopAnimation(id) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('ops.apply', { ops: [{ op: 'animation.stop', target: id }] }, roomId);
    await get().refresh();
  },

  async defineAnimation(id, clip) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('animation.define', { nodeId: id, clip }, roomId);
    await get().refresh();
  },

  async clearAnimation(id) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('animation.clear', { nodeId: id }, roomId);
    await get().refresh();
  },

  async createFx(spec) {
    const roomId = get().roomId;
    if (!roomId) return null;
    const out = await rpc<{ fxId: string }>('fx.create', spec, roomId);
    await get().refresh();
    return out.fxId;
  },

  async deleteFx(fxId) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('fx.delete', { fxId }, roomId);
    await get().refresh();
  },

  async setFog(fog) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('env.set', { fog }, roomId);
    await get().refresh();
  },

  async undo() {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('scene.undo', {}, roomId);
    await get().refresh();
  },

  async redo() {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('scene.redo', {}, roomId);
    await get().refresh();
  },

  dispose() {
    get().socket?.close();
    useConn.getState().reset();
    set({ socket: null, doc: null, status: 'idle', roomId: '', importing: null });
  },
}));

export const selectedNode = (s: DocStore) => {
  const id = useSelection.getState().primary;
  return id && s.doc ? (s.doc.nodes[id] ?? null) : null;
};
