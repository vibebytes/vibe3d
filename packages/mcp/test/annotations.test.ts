import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../../capabilities/generated/mcp';

const byName = (name: string) => MCP_TOOLS.find((tool) => tool.name === name);

const DESTRUCTIVE_GROUPS = [
  'vibe3d_room',
  'vibe3d_scene',
  'vibe3d_node',
  'vibe3d_asset',
  'vibe3d_camera',
  'vibe3d_fx',
  'vibe3d_animation',
];

describe('MCP 工具注解', () => {
  it('每个工具都显式给出四个 hint，不留 MCP 默认值', () => {
    for (const tool of MCP_TOOLS) {
      const a = tool.annotations ?? {};
      expect(typeof a.readOnlyHint, tool.name).toBe('boolean');
      expect(typeof a.destructiveHint, tool.name).toBe('boolean');
      expect(typeof a.idempotentHint, tool.name).toBe('boolean');
      expect(typeof a.openWorldHint, tool.name).toBe('boolean');
      expect(a.openWorldHint, tool.name).toBe(false);
    }
  });

  it('含破坏性 op 的分组标记 destructive，且不再宣称只读', () => {
    for (const name of DESTRUCTIVE_GROUPS) {
      const tool = byName(name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations?.destructiveHint, name).toBe(true);
      expect(tool?.annotations?.readOnlyHint, name).toBe(false);
    }
  });

  it('纯写分组不标 destructive', () => {
    for (const name of ['vibe3d_mesh', 'vibe3d_stage', 'vibe3d_material']) {
      expect(byName(name)?.annotations?.destructiveHint, name).toBe(false);
    }
  });

  it('只读分组 readOnly 且 idempotent', () => {
    const status = byName('vibe3d_status');
    expect(status?.annotations?.readOnlyHint).toBe(true);
    expect(status?.annotations?.idempotentHint).toBe(true);
    expect(status?.annotations?.destructiveHint).toBe(false);
  });

  it('仍保持 room.close 的 destructive 语义（聚合到 room 分组）', () => {
    const room = byName('vibe3d_room');
    expect(room?.annotations?.destructiveHint).toBe(true);
    expect(room?.annotations?.readOnlyHint).toBe(false);
  });
});
