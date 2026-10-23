import type { CameraState, Material, SceneDoc, StageState } from '@vibebyte/vibe3d-protocol';
import { create } from 'zustand';
import { rpc } from '../lib/rpc';
import { type RoomSocket, connectRoom } from '../lib/ws';
import type { CaptureOptions, CaptureResult } from '../viewport/CaptureBridge';
import { useConn } from './conn';
import { useSelection } from './selection';

declare global {
  interface Window {
    __vibe3dCapture?: (opts?: CaptureOptions) => CaptureResult | null;
    __vibe3dReady?: boolean;
    __vibe3dExport?: (nodeIds?: string[] | null) => Promise<string>;
    vibe3d?: {
      roomId: string;
      select(id: string | null): void;
      capture(opts?: CaptureOptions): CaptureResult | null;
      exportGlb(nodeIds?: string[] | null): Promise<string>;
    };
  }
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface DocStore {
  roomId: string;
  doc: SceneDoc | null;
  status: Status;
  error: string | null;
  online: boolean;
  socket: RoomSocket | null;
  load(roomId: string): Promise<void>;
  refresh(): Promise<void>;
  createNode(kind: 'box' | 'sphere' | 'cylinder' | 'light'): Promise<void>;
  patchNode(id: string, patch: Record<string, unknown>): Promise<void>;
  patchMaterial(id: string, material: Material): Promise<void>;
  removeNode(id: string): Promise<void>;
  setStage(stage: Partial<StageState>): Promise<void>;
  setCamera(camera: CameraState): Promise<void>;
  frameCamera(mode: 'fit' | 'close' | 'wide'): Promise<void>;
  playAnimation(id: string, opts?: { clip?: string; speed?: number }): Promise<void>;
  stopAnimation(id: string): Promise<void>;
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
        (evt) => {
          if (evt.event === 'scene.changed') void get().refresh();
          if (evt.event === 'snapshot.request') {
            const requestId = typeof evt.data.requestId === 'string' ? evt.data.requestId : null;
            if (!requestId) return;
            const num = (key: string): number | undefined => {
              const value = evt.data[key];
              return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
            };
            try {
              const shot = window.__vibe3dCapture?.({
                width: num('width'),
                height: num('height'),
                format: evt.data.format === 'jpeg' ? 'jpeg' : 'png',
                at: num('at'),
                transparent: evt.data.transparent === true,
              });
              if (shot) {
                get().socket?.send({
                  type: 'snapshot.result',
                  requestId,
                  png: shot.base64,
                  mime: shot.mime,
                  width: shot.width,
                  height: shot.height,
                });
              } else {
                get().socket?.send({ type: 'snapshot.result', requestId, error: 'capture unavailable' });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              get().socket?.send({ type: 'snapshot.result', requestId, error: message });
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

  async setCamera(camera) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('camera.set', { camera }, roomId);
    await get().refresh();
  },

  async frameCamera(mode) {
    const roomId = get().roomId;
    if (!roomId) return;
    await rpc('camera.set', { frame: mode }, roomId);
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
    await rpc('animation.stop', { nodeId: id }, roomId);
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
    set({ socket: null, doc: null, status: 'idle', roomId: '' });
  },
}));

export const selectedNode = (s: DocStore) => {
  const id = useSelection.getState().primary;
  return id && s.doc ? (s.doc.nodes[id] ?? null) : null;
};
