import { MCP_TOOLS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { getPrompt, listPrompts } from '../src/guide';
import { listTools, toolByName } from '../src/tools';

const tools = listTools();
const byName = (name: string) => tools.find((tool) => tool.name === name);

describe('K1 工具描述分组', () => {
  it('每条描述都以工具名前缀开头', () => {
    for (const tool of tools.slice(1)) {
      expect(tool.description.startsWith(`[${tool.name.slice(7)}] `), tool.name).toBe(true);
    }
  });

  it('多 op 工具在描述里直接列出 op，必填指向 params 描述', () => {
    expect(byName('vibe3d_node')?.description).toMatch(/op: .*create/);
    expect(byName('vibe3d_node')?.description).toContain('必填见 params 描述');
    expect(byName('vibe3d_scene')?.description).toContain('vibe3d_help');
  });

  it('单 op 工具仍然扁平，不要求 op', () => {
    expect(byName('vibe3d_status')?.description).not.toContain('op: ');
    expect(byName('vibe3d_apply_ops')?.description).toContain('逐条操作请用专用工具');
  });

  it('旧扁平工具名仍能解析到分组工具', () => {
    expect(toolByName('vibe3d_create_node')?.name).toBe('vibe3d_node');
    expect(toolByName('vibe3d_render_snapshot')?.name).toBe('vibe3d_render');
  });

  it('tools/list = 分组工具 + 一个 help', () => {
    expect(tools.length).toBe(MCP_TOOLS.length + 1);
    expect(byName('vibe3d_help')).toBeDefined();
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
    expect(text).toContain('vibe3d_room {op:"create"}');
    expect(text).toContain('vibe3d_scene {op:"stats"}');
    expect(text).toContain('vibe3d_render {op:"snapshot"}');
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
