import { Studio, mockTransport } from '@vibebyte/vibe3d-client';
import { emptyDoc } from '@vibebyte/vibe3d-protocol';

export interface Call {
  method: string;
  params: Record<string, unknown>;
  roomId?: string;
}

const png = Buffer.from('png').toString('base64');

function defaults(method: string): unknown {
  switch (method) {
    case 'hello':
      return { protocolVersion: '1', daemonVersion: '0', renderer: 'test', capabilities: ['scene.get'] };
    case 'room.create':
      return { roomId: 'r_new' };
    case 'room.get':
      return { roomId: 'r_new', name: 'n', revision: 0, nodeCount: 0, createdAt: 't', updatedAt: 't' };
    case 'room.list':
      return { rooms: [] };
    case 'scene.export':
      return { doc: emptyDoc('exported'), revision: 3 };
    case 'render.snapshot':
      return { revision: 1, mime: 'image/png', base64: png, width: 8, height: 8 };
    case 'render.node':
      return {
        revision: 1,
        nodeId: 'n1',
        target: {},
        mime: 'image/png',
        base64: png,
        width: 8,
        height: 8,
        camera: {},
      };
    case 'render.views':
      return {
        revision: 1,
        target: {},
        views: ['front', 'top'].map((view) => ({
          view,
          label: view,
          mime: 'image/png',
          base64: png,
          width: 8,
          height: 8,
          camera: {},
        })),
      };
    case 'export.glb':
      return { jobId: 'j1' };
    case 'job.get':
      return { state: 'done', jobId: 'j1', url: '/x.glb', revision: 1 };
    default:
      return {};
  }
}

/** 录下 run() 发出的每个能力调用；responses 按 method 覆盖默认假结果。 */
export function recording(responses: Record<string, unknown> = {}): {
  calls: Call[];
  connect: () => Promise<Studio>;
} {
  const calls: Call[] = [];
  const transport = mockTransport({
    dispatch: async (method, params, opts) => {
      calls.push({ method, params, roomId: opts?.roomId });
      return method in responses ? responses[method] : defaults(method);
    },
    health: async () => ({ ok: true, version: '0', protocolVersion: '1', rooms: 0, renderer: 'test' }),
    uploadAsset: async () => ({ sha: 's_test' }),
  });
  return {
    calls,
    connect: async () => Studio.over(transport),
  };
}
