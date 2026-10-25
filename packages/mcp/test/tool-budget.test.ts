import { describe, expect, it } from 'vitest';
import { listTools } from '../src/tools';

const tools = listTools();
const byName = (name: string) => tools.find((tool) => tool.name === name);
const quoted = tools.map((tool) => ({ name: tool.name, bytes: JSON.stringify(tool).length }));

describe('advertised tool list budget', () => {
  it('keeps the whole tools/list payload under 16KB', () => {
    expect(JSON.stringify(tools).length).toBeLessThanOrEqual(16 * 1024);
  });

  it('keeps every description under 360 chars', () => {
    const long = tools
      .map((tool) => ({ name: tool.name, chars: tool.description.length }))
      .filter((tool) => tool.chars > 360);
    expect(long).toEqual([]);
  });

  it('keeps every input schema under 6KB', () => {
    const heavy = quoted.filter((tool) => tool.bytes > 6 * 1024);
    expect(heavy).toEqual([]);
  });

  it('advertises apply_ops as a loose op array instead of the full union', () => {
    const schema = byName('vibe3d_apply_ops')?.inputSchema as {
      properties?: Record<string, { items?: { type?: string } }>;
    };
    expect(schema.properties?.ops?.items?.type).toBe('object');
  });

  it('tells the model to prefer dedicated tools over apply_ops', () => {
    expect(byName('vibe3d_apply_ops')?.description).toContain('逐条操作请用专用工具');
  });

  it('documents colour and id conventions where they actually bite', () => {
    expect(byName('vibe3d_stage')?.description).toContain('[r,g,b,a]');
    expect(byName('vibe3d_material')?.description).toMatch(/服务端生成/);
    expect(byName('vibe3d_fx')?.description).toContain('服务端生成');
    expect(tools.some((tool) => tool.description.includes('#RRGGBB'))).toBe(true);
  });

  it('points at id-pass capability from the status tool', () => {
    expect(byName('vibe3d_status')?.description).toContain('id-pass');
  });
});
