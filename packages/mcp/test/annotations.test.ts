import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../../capabilities/generated/mcp';

const DESTRUCTIVE = [
  'vibe3d_undo',
  'vibe3d_redo',
  'vibe3d_delete_node',
  'vibe3d_delete_asset',
  'vibe3d_delete_camera',
  'vibe3d_delete_fx',
  'vibe3d_clear_animation',
  'vibe3d_restore_scene',
  'vibe3d_close_room',
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

  it('读工具幂等、写工具非幂等；删除/撤销类标记 destructive', () => {
    for (const tool of MCP_TOOLS) {
      const a = tool.annotations ?? {};
      expect(a.idempotentHint, tool.name).toBe(a.readOnlyHint);
      if (DESTRUCTIVE.includes(tool.name)) expect(a.destructiveHint, tool.name).toBe(true);
    }
  });

  it('仍保持 room.close 的 destructive 语义', () => {
    const close = MCP_TOOLS.find((t) => t.name === 'vibe3d_close_room');
    expect(close?.annotations?.destructiveHint).toBe(true);
    expect(close?.annotations?.readOnlyHint).toBe(false);
  });
});
