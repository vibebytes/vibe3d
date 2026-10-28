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
  const rooms = new Map<
    string,
    { id: string; invoke: (method: string, params: Record<string, unknown>) => Promise<unknown> }
  >();
  const studio = {
    client,
    createRoom: async (input: Record<string, unknown>) => {
      const room = (await client.call('room.create', input)) as { roomId: string };
      return { id: room.roomId };
    },
    room: (roomId: string) => {
      const cached = rooms.get(roomId);
      if (cached) return cached;
      const handle = {
        id: roomId,
        invoke: async (method: string, params: Record<string, unknown>) => {
          calls.push({ method, roomId, params });
          if (method === 'room.get') return { roomId, name: 'x', revision: 1, nodeCount: 0 };
          if (method === 'editor.open') {
            return { url: `http://127.0.0.1:1/r/${roomId}`, reused: true, opened: false, editors: 1 };
          }
          return { revision: 1, closed: true };
        },
      };
      rooms.set(roomId, handle);
      return handle;
    },
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
  it('room_id 作为可选字段出现在所有房间级工具，且从不进入 required', () => {
    for (const tool of MCP_TOOLS) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect(required.includes('room_id'), tool.name).toBe(false);
    }
    const room = MCP_TOOLS.find((tool) => tool.name === 'vibe3d_room');
    const node = MCP_TOOLS.find((tool) => tool.name === 'vibe3d_node');
    expect('room_id' in propsOf(room?.inputSchema)).toBe(true);
    expect('room_id' in propsOf(node?.inputSchema)).toBe(true);
    expect(
      'room_id' in propsOf(MCP_TOOLS.find((tool) => tool.name === 'vibe3d_apply_ops')?.inputSchema),
    ).toBe(true);
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

  it('显式 room_id 只路由这一次调用，不改写默认房间', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000a');
    const result = await runtime.call('vibe3d_get_scene', { room_id: 'r_0000000b' });
    expect(result.isError).toBeUndefined();
    expect((calls.at(-1) as Call).roomId).toBe('r_0000000b');
    expect(runtime.session.current).toBe('r_0000000a');
    await runtime.call('vibe3d_get_scene', {});
    expect((calls.at(-1) as Call).roomId).toBe('r_0000000a');
  });

  it('get_room 的 room_id 不改写已有默认房间，未绑定时才采纳', async () => {
    const { studio } = fakeStudio();
    const bound = new ToolRuntime(studio, 'r_0000000a');
    await bound.call('vibe3d_get_room', { room_id: 'r_0000000b' });
    expect(bound.session.current).toBe('r_0000000a');
    const fresh = new ToolRuntime(studio);
    await fresh.call('vibe3d_get_room', { room_id: 'r_0000000b' });
    expect(fresh.session.current).toBe('r_0000000b');
  });

  it('隐式调用在结果末尾标注所用房间；显式调用不标注', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000a');
    const implicit = await runtime.call('vibe3d_get_scene', {});
    expect(JSON.stringify(implicit.content)).toContain('隐式');
    const explicit = await runtime.call('vibe3d_get_scene', { room_id: 'r_0000000a' });
    expect(JSON.stringify(explicit.content)).not.toContain('隐式');
  });

  it('进程里出现第二个房间后，不带 room_id 的调用被拒绝并列出候选', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_create_room', { name: 'A' });
    const second = await runtime.call('vibe3d_create_room', { name: 'B' });
    expect(JSON.stringify(second.content)).toContain('显式传 room_id');
    const before = calls.length;
    const refused = await runtime.call('vibe3d_create_node', { kind: 'mesh', shape: 'box' });
    expect(refused.isError).toBe(true);
    expect(String(jsonOf(refused).message)).toContain('多个房间');
    expect(String(jsonOf(refused).message)).toContain('r_00000001');
    expect(calls).toHaveLength(before);
    const ok = await runtime.call('vibe3d_create_node', {
      kind: 'mesh',
      shape: 'box',
      room_id: 'r_00000001',
    });
    expect(ok.isError).toBeUndefined();
    expect((calls.at(-1) as Call).roomId).toBe('r_00000001');
  });

  it('use_room 是显式钉死默认房间：之后隐式调用恢复可用', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_use_room', { roomId: 'r_00000001' });
    const ok = await runtime.call('vibe3d_get_scene', {});
    expect(ok.isError).toBeUndefined();
    expect((calls.at(-1) as Call).roomId).toBe('r_00000001');
  });

  it('关闭一个房间后只剩一个时，默认房间自动指向它', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_close_room', { room_id: 'r_00000002' });
    await runtime.call('vibe3d_get_scene', {});
    expect((calls.at(-1) as Call).roomId).toBe('r_00000001');
  });

  it('open_editor 在多房间且未指定时被拒绝，不新建房间', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_create_room', {});
    await runtime.call('vibe3d_create_room', {});
    const before = calls.length;
    const refused = await runtime.call('vibe3d_open_editor', {});
    expect(refused.isError).toBe(true);
    expect(calls).toHaveLength(before);
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

  it('open_editor 已绑定时复用当前房间，不再 createRoom', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    await runtime.call('vibe3d_open_editor', {});
    expect(calls.map((call) => call.method)).toEqual(['editor.open']);
    expect((calls[0] as Call).roomId).toBe('r_0000000c');
    expect(runtime.session.current).toBe('r_0000000c');
  });

  it('open_editor 连续两次未绑定时也只建一次房', async () => {
    const { studio, calls } = fakeStudio();
    const runtime = new ToolRuntime(studio);
    await runtime.call('vibe3d_open_editor', {});
    await runtime.call('vibe3d_open_editor', {});
    expect(calls.filter((call) => call.method === 'room.create')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'editor.open')).toHaveLength(2);
    expect(runtime.session.current).toBe('r_00000001');
  });

  it('open_editor 的返回体带 state 与 next，告诉 LLM 画面到底连上没有', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const connected = jsonOf(await runtime.call('vibe3d_open_editor', { room_id: 'r_0000000c' }));
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
    const view = jsonOf(await runtime.call('vibe3d_open_editor', { room_id: 'r_0000000c' }));
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

  it('snapshot 返回体带上 fog / distanceToTarget / warning', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const shot = {
      revision: 3,
      mime: 'image/png',
      base64: 'AAAA',
      width: 64,
      height: 64,
      quality: 'standard',
      fog: { enabled: true, color: 0xffffff, near: 1, far: 40, mode: 'doc' },
      distanceToTarget: 55,
      camera: { position: [0, 5, 55], target: [0, 0, 0] },
      warning: '主体已在雾远端之外，画面会塌成雾色',
    };
    (studio as unknown as { room: unknown }).room = (roomId: string) => ({
      id: roomId,
      invoke: async () => shot,
    });
    const result = await runtime.call('vibe3d_render_snapshot', { width: 64, height: 64 });
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.distanceToTarget).toBe(55);
    expect((structured.fog as Record<string, unknown>).enabled).toBe(true);
    expect(structured.warning).toContain('雾远端');
    const text = JSON.parse((result.content[1] as { text: string }).text) as Record<string, unknown>;
    expect(text.distanceToTarget).toBe(55);
    expect((text.fog as Record<string, unknown>).far).toBe(40);
    expect(text.warning).toContain('雾远端');
    const texts = result.content.filter((c) => c.type === 'text') as Array<{ text: string }>;
    expect(texts.some((c) => c.text.includes('⚠') && c.text.includes('雾远端'))).toBe(true);
  });

  it('snapshot 无 warning 时不追加告警 text', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const shot = {
      revision: 3,
      mime: 'image/png',
      base64: 'AAAA',
      width: 64,
      height: 64,
      fog: { enabled: false, color: 0xffffff, near: 0, far: 0, mode: 'off', reason: 'option' },
      distanceToTarget: 12,
      camera: { position: [0, 5, 12], target: [0, 0, 0] },
      warning: null,
    };
    (studio as unknown as { room: unknown }).room = (roomId: string) => ({
      id: roomId,
      invoke: async () => shot,
    });
    const result = await runtime.call('vibe3d_render_snapshot', { width: 64, height: 64 });
    const texts = result.content.filter((c) => c.type === 'text') as Array<{ text: string }>;
    expect(texts.filter((c) => c.text.includes('⚠'))).toHaveLength(0);
    expect((result.structuredContent as Record<string, unknown>).distanceToTarget).toBe(12);
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
    const result = await runtime.call('vibe3d_node', {
      op: 'create',
      node: { kind: 'mesh', shape: 'box', size: [1, 2, 1] },
    });
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
    expect(result.content).toHaveLength(3);
    const note = result.content[1] as { text: string };
    expect(note.text).toContain('backgound');
    expect(note.text).toContain('未采用');
    expect(note.text).toContain('vibe3d_help');
  });

  it('合法调用不带 warning', async () => {
    const { studio } = fakeStudio();
    const runtime = new ToolRuntime(studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_stage', { op: 'env', background: [0.1, 0.2, 0.3, 1] });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => (c as { text: string }).text).some((t) => t.includes('未采用'))).toBe(
      false,
    );
  });
});

describe('vibe3d_help：全局约定常驻首页', () => {
  it('不带 tool 时先给 conventions，再列工具索引', async () => {
    const runtime = new ToolRuntime(fakeStudio().studio, 'r_0000000c');
    const result = await runtime.call('vibe3d_help', {});
    const text = (result.content[0] as { text: string }).text;
    const body = JSON.parse(text) as { conventions: Record<string, string>; tools: unknown[] };
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.conventions.world).toContain('米');
    expect(body.conventions.fov).toContain('camera.fov');
    expect(body.conventions.color).toContain('#RRGGBB');
  });
});
