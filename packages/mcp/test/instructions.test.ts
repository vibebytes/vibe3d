import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../src/instructions';
import { listTools } from '../src/tools';

const NAMES = new Set(listTools().map((tool) => tool.name));
const BARE = ['create_node', 'update_node', 'create_material', 'set_environment', 'create_fx'];

describe('initialize instructions', () => {
  it('引用的 vibe3d 工具名都存在于 tools/list', () => {
    const mentioned = INSTRUCTIONS.match(/vibe3d_[a-z_]+/g) ?? [];
    const missing = [...new Set(mentioned)].filter((name) => !NAMES.has(name));
    expect(missing).toEqual([]);
  });

  it('不再出现已废弃的裸工具名', () => {
    for (const name of BARE) expect(INSTRUCTIONS).not.toContain(name);
  });
});
