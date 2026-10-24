import { MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { getPrompt, listPrompts } from '../src/guide';
import { listTools } from '../src/tools';

const tools = listTools();
const byName = (name: string) => tools.find((tool) => tool.name === name);
const specOf = (name: string) => MCP_TOOLS.find((tool) => tool.name === name);

describe('K1 工具描述分组', () => {
  it('每条描述都以能力命名空间前缀开头', () => {
    for (const tool of tools) {
      const spec = specOf(tool.name);
      expect(spec, tool.name).toBeDefined();
      expect(tool.description.startsWith(`[${spec?.capability.split('.')[0]}] `), tool.name).toBe(true);
    }
  });

  it('前缀取自能力命名空间，不靠工具名猜', () => {
    expect(byName('vibe3d_render_snapshot')?.description).toMatch(/^\[render\] /);
    expect(byName('vibe3d_create_node')?.description).toMatch(/^\[node\] /);
    expect(byName('vibe3d_create_room')?.description).toMatch(/^\[room\] /);
    expect(byName('vibe3d_scene_stats')?.description).toMatch(/^\[scene\] /);
    expect(byName('vibe3d_apply_ops')?.description).toMatch(/^\[ops\] /);
  });

  it('分组只加前缀，正文与附加提示不变', () => {
    expect(byName('vibe3d_apply_ops')?.description).toContain('逐条操作请用专用工具');
    expect(byName('vibe3d_create_node')?.description).toContain('#RRGGBB');
    expect(byName('vibe3d_set_environment')?.description).toContain('[r,g,b,a]');
  });

  it('不新增工具：tools/list 仍与注册表逐条对齐', () => {
    expect(tools.length).toBe(MCP_TOOLS.length);
  });
});

describe('K1 任务剧本（MCP prompts，按需加载）', () => {
  it('六本剧本按任务组织，名字带 vibe3d 前缀', () => {
    expect(listPrompts().map((prompt) => prompt.name)).toEqual([
      'vibe3d.build',
      'vibe3d.edit',
      'vibe3d.render',
      'vibe3d.verify',
      'vibe3d.import',
      'vibe3d.history',
    ]);
  });

  it('listPrompts 只回名字/标题/一句话，不回正文', () => {
    for (const prompt of listPrompts()) {
      expect(Object.keys(prompt).sort()).toEqual(['description', 'name', 'title']);
      expect(prompt.description.length).toBeLessThanOrEqual(120);
    }
  });

  it('剧本给步骤与具体工具名，不打包全量 spec', () => {
    const text = getPrompt('vibe3d.build').messages[0]?.content.text ?? '';
    expect(text).toContain('vibe3d_create_room');
    expect(text).toContain('vibe3d_scene_stats');
    expect(text).toContain('vibe3d_render_snapshot');
    expect(text).not.toContain('inputSchema');
  });

  it('剧本里引用的工具都真实存在', () => {
    const known = new Set(tools.map((tool) => tool.name));
    for (const prompt of listPrompts()) {
      for (const message of getPrompt(prompt.name).messages) {
        for (const name of message.content.text.match(/vibe3d_[a-z_]+/g) ?? []) {
          expect(known.has(name), `${prompt.name} → ${name}`).toBe(true);
        }
      }
    }
  });

  it('单本 ≤ 4KB，全部 ≤ 16KB', () => {
    for (const prompt of listPrompts()) {
      const bytes = JSON.stringify(getPrompt(prompt.name)).length;
      expect(bytes, prompt.name).toBeLessThanOrEqual(4 * 1024);
    }
    const all = listPrompts().reduce((sum, prompt) => sum + JSON.stringify(getPrompt(prompt.name)).length, 0);
    expect(all).toBeLessThanOrEqual(16 * 1024);
  });

  it('未知剧本报 E_NO_PROMPT 并列出可选', () => {
    expect(() => getPrompt('vibe3d.nope')).toThrow(/E_NO_PROMPT/);
    expect(() => getPrompt('vibe3d.nope')).toThrow(/vibe3d\.build/);
  });
});
