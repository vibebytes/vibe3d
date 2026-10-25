import { MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import type { Studio } from '@vibebyte/vibe3d-client';
import { describe, expect, it } from 'vitest';
import { type ToolResult, ToolRuntime } from '../src/tools';

interface Call {
  method: string;
  roomId?: string;
  params: Record<string, unknown>;
}

function fakeStudio() {
  const calls: Call[] = [];
  let seq = 0;
  const client = {
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'room.create') {
        seq += 1;
        const roomId = `r_${String(seq).padStart(8, '0')}`;
        return { roomId, name: 'x', url: `http://127.0.0.1:1/r/${roomId}`, revision: 0 };
      }
      return { revision: 1 };
    },
  };
  const studio = {
    client,
    createRoom: async (input: Record<string, unknown>) => {
      const room = (await client.call('room.create', input)) as { roomId: string };
      return { id: room.roomId };
    },
    room: (roomId: string) => ({
      id: roomId,
      invoke: async (method: string, params: Record<string, unknown>) => {
        calls.push({ method, roomId, params });
        if (method === 'room.get') return { roomId, name: 'x', revision: 1, nodeCount: 0 };
        if (method === 'editor.open') {
          return { url: `http://127.0.0.1:1/r/${roomId}`, reused: true, opened: false, editors: 1 };
        }
        return { revision: 1, closed: true };
      },
    }),
  };
  return { studio: studio as unknown as Studio, calls };
}

const jsonOf = (result: ToolResult): Record<string, unknown> => {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as Record<string, unknown>;
};

const propsOf = (schema: unknown): Record<string, unknown> =>
  (schema as { properties?: Record<string, unknown> }).properties ?? {};

describe('MCP 工具 schema：room_id 只在连接层', () => {
  it('room_id 只作为可选字段出现，且从不进入 required', () => {
    for (const tool of MCP_TOOLS) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect(required.includes('room_id'), tool.name).toBe(false);
    }
    const room = MCP_TOOLS.find((tool) => tool.name === 'vibe3d_room');
    const node = MCP_TOOLS.find((tool) => tool.name === 'vibe3d_node');
    expect('room_id' in propsOf(room?.inputSchema)).toBe(true);
    expect('room_id' in propsOf(node?.inputSchema)).toBe(false);
  });
});

describe('ToolRuntime 会话绑定', () => {
  it('未绑定时 room 级工具直接报错，提示先建房', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    const result = await runtime.call('vibe3d_create_node', { kind: 'mesh' });
    expect(result.isError).toBe(true);
    expect(jsonOf(result).code).toBe('E_INVALID_PARAMS');
    expect(String(jsonOf(result).message)).toContain('vibe3d_create_room');
    expect(calls).toHaveLength(0);
  });

  it('create_room 后自动绑定，后续工具不再传 room_id', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    const created = await runtime.call('vibe3d_create_room', { name: '客厅' });
    expect(jsonOf(created).roomId).toBe('r_00000001');
    const result = await runtime.call('vibe3d_create_node', { kind: 'mesh', shape: 'box' });
    expect(result.isError).toBeUndefined();
    const last = calls.at(-1) as Call;
    expect(last.method).toBe('node.create');
    expect(last.roomId).toBe('r_00000001');
    expect(last.params).toEqual({ kind: 'mesh', shape: 'box' });
  });

  it('旧客户端传相同 room_id 时忽略该参数', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000a');
    const result = await runtime.call('vibe3d_create_node', { kind: 'mesh', room_id: 'r_0000000a' });
    expect(result.isError).toBeUndefined();
    expect((calls.at(-1) as Call).roomId).toBe('r_0000000a');
    expect((calls.at(-1) as Call).params).not.toHaveProperty('roomId');
  });

  it('旧客户端传别的 room_id 时显式报错，不下发 RPC', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000a');
    const result = await runtime.call('vibe3d_get_scene', { room_id: 'r_0000000b' });
    expect(result.isError).toBe(true);
    expect(jsonOf(result).code).toBe('E_INVALID_PARAMS');
    expect(String(jsonOf(result).message)).toContain('vibe3d_get_room');
    expect(calls).toHaveLength(0);
  });

  it('get_room 的 room_id 会切换绑定', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000a');
    await runtime.call('vibe3d_get_room', { room_id: 'r_0000000b' });
    expect(runtime.session.current).toBe('r_0000000b');
    await runtime.call('vibe3d_get_scene', {});
    expect((calls.at(-1) as Call).roomId).toBe('r_0000000b');
  });

  it('关闭当前房间后解绑', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_close_room', {});
    expect(runtime.session.current).toBeUndefined();
    const result = await runtime.call('vibe3d_get_scene', {});
    expect(result.isError).toBe(true);
  });

  it('open_editor 未绑定时先建房再打开', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_open_editor', {});
    expect(calls.map((call) => call.method)).toEqual(['room.create', 'editor.open']);
    expect((calls[1] as Call).roomId).toBe('r_00000001');
    expect(runtime.session.current).toBe('r_00000001');
  });

  it('open_editor 的返回体带 state 与 next，告诉 LLM 画面到底连上没有', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const connected = jsonOf(await runtime.call('vibe3d_open_editor', {}));
    console.log('DEBUG', JSON.stringify(connected), runtime.session.current);
    expect(connected.state).toBe('connected');
    expect(connected.editors).toBe(1);
    expect(connected.url).toBe('http://127.0.0.1:1/r/r_0000000c');
    expect(connected.reused).toBe(true);
    expect(connected.opened).toBe(false);
    expect(String(connected.next)).toContain('不要再调用 vibe3d_open_editor');
  });

  it('open_editor 没有窗口连接时引导改用 snapshot', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const room = studio.room('r_0000000c') as unknown as {
      invoke: (method: string, params: Record<string, unknown>) => Promise<unknown>;
    };
    const original = room.invoke;
    room.invoke = async (method, params) =>
      method === 'editor.open'
        ? { url: 'http://127.0.0.1:1/r/r_0000000c', reused: false, opened: false, editors: 0 }
        : original(method, params);
    const view = jsonOf(await runtime.call('vibe3d_open_editor', {}));
    expect(view.state).toBe('not_connected');
    expect(String(view.next)).toContain('vibe3d_render_snapshot');
  });

  it('构造参数可预绑定房间', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    await runtime.call('vibe3d_render_snapshot', { width: 64, height: 64 });
    expect((calls.at(-1) as Call).roomId).toBe('r_0000000c');
  });

  it('参数校验失败的 message 里带字段与原因', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_render_snapshot', { width: 'abc' });
    expect(result.isError).toBe(true);
    expect(String(jsonOf(result).message)).toContain('width');
    expect(calls).toHaveLength(0);
  });

  it('snake_case 数字字符串按数字下发', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    await runtime.call('vibe3d_render_snapshot', { width: '640', height: '480', settle_ms: '120' });
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.width).toBe(640);
    expect(params.settleMs).toBe(120);
  });

  it('apply_ops 收到 JSON 字符串与字符串布尔时自动还原', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const ops = JSON.stringify([{ op: 'node.delete', id: 'n_12345678', cascade: 'false' }]);
    const result = await runtime.call('vibe3d_apply_ops', { ops, dry_run: 'true' });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.ops).toEqual([{ op: 'node.delete', id: 'n_12345678', cascade: false }]);
    expect(params.dryRun).toBe(true);
  });

  it('数组里的数字字符串按数字还原', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_create_node', {
      kind: 'mesh',
      shape: 'box',
      size: ['1', '2', '1'],
    });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.size).toEqual([1, 2, 1]);
  });

  it('单个 op 的 JSON 字符串自动包成数组', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const ops = JSON.stringify({ op: 'node.delete', id: 'n_12345678' });
    const result = await runtime.call('vibe3d_apply_ops', { ops });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.ops).toEqual([{ op: 'node.delete', id: 'n_12345678' }]);
  });

  it('{"ops":[...]} 包装字符串自动解包', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const ops = JSON.stringify({ ops: [{ op: 'node.delete', id: 'n_12345678' }] });
    const result = await runtime.call('vibe3d_apply_ops', { ops });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.ops).toEqual([{ op: 'node.delete', id: 'n_12345678' }]);
  });

  it('解析成功但条目非法时报条目级错误，而不是“Expected array”', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_apply_ops', { ops: '[{"op":"node.delete"}]' });
    expect(result.isError).toBe(true);
    const message = String(jsonOf(result).message);
    expect(message).toContain('ops.0');
    expect(message).not.toContain('Expected array, received string');
  });

  it('非 JSON 的字符串报错里带解析失败原因', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_apply_ops', { ops: '[{"op":"node.delete"' });
    expect(result.isError).toBe(true);
    expect(String(jsonOf(result).message)).toContain('JSON 解析失败');
  });

  it('非 JSON 的字符串不会被强行解析', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_apply_ops', { ops: 'not-json' });
    expect(result.isError).toBe(true);
    expect(String(jsonOf(result).message)).toContain('ops');
  });
});

describe('legacy 工具的同名包装与忽略字段', () => {
  it('vibe3d_stage env 接受 {env:{…}} 包装，按平铺参数下发', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_stage', { op: 'env', env: { background: [0.1, 0.2, 0.3, 1] } });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.background).toEqual([0.1, 0.2, 0.3, 1]);
    expect(params.env).toBeUndefined();
  });

  it('vibe3d_node create 接受 {node:{…}} 包装', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_node', { op: 'create', node: { kind: 'mesh', shape: 'box', size: [1, 2, 1] } });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.kind).toBe('mesh');
    expect(params.size).toEqual([1, 2, 1]);
    expect(params.node).toBeUndefined();
  });

  it('vibe3d_node 也接受全名 op（node.create）', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_node', {
      op: 'node.create',
      node: { kind: 'mesh', shape: 'box', size: [1, 2, 1] },
    });
    expect(result.isError).toBeFalsy();
    const params = (calls.at(-1) as Call).params as Record<string, unknown>;
    expect(params.kind).toBe('mesh');
    expect(params.node).toBeUndefined();
  });

  it('拼错的字段会回一条 warning，而不是静默丢弃', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_stage', { op: 'env', backgound: [0.1, 0.2, 0.3, 1] });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(2);
    const note = result.content[1] as { text: string };
    expect(note.text).toContain('backgound');
    expect(note.text).toContain('已忽略');
  });

  it('合法调用不带 warning', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_stage', { op: 'env', background: [0.1, 0.2, 0.3, 1] });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
  });
});
