import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildSpecDoc, generateFiles } from '../src/gen/generate';
import { CAPABILITIES, CAPABILITY_NAMES } from '../src/registry';

const generatedDir = join(dirname(fileURLToPath(import.meta.url)), '../generated');

const read = (name: string): string => readFileSync(join(generatedDir, name), 'utf8');

describe('capability registry', () => {
  it('暴露 68 个能力，名字与 wire/scope 自洽', () => {
    expect(CAPABILITY_NAMES).toHaveLength(68);
    for (const name of CAPABILITY_NAMES) {
      const spec = CAPABILITIES[name];
      expect(spec.title.length).toBeGreaterThan(0);
      expect(spec.input).toBeInstanceOf(z.ZodObject);
      expect(spec.output).toBeInstanceOf(z.ZodObject);
    }
  });

  it('room scope 必带 roomId，daemon scope 必不带', () => {
    for (const name of CAPABILITY_NAMES) {
      const spec = CAPABILITIES[name] as unknown as { scope: string; input: z.ZodObject<z.ZodRawShape> };
      const hasRoom = 'roomId' in spec.input.shape;
      expect(hasRoom, name).toBe(spec.scope === 'room');
    }
  });

  it('每个 MCP tool 名唯一且带 vibe3d_ 前缀', () => {
    const tools = CAPABILITY_NAMES.map(
      (n) => (CAPABILITIES[n] as { mcp?: { tool?: string } }).mcp?.tool,
    ).filter((t): t is string => !!t);
    expect(new Set(tools).size).toBe(tools.length);
    for (const tool of tools) expect(tool.startsWith('vibe3d_')).toBe(true);
  });

  it('只有 editor.open 是 hostCoupled', () => {
    const coupled = CAPABILITY_NAMES.filter(
      (n) => (CAPABILITIES[n] as { hostCoupled?: boolean }).hostCoupled,
    );
    expect(coupled).toEqual(['editor.open']);
  });
});

describe('generated artifacts', () => {
  it('四个文件与 registry 生成结果一致（幂等）', () => {
    const files = generateFiles();
    expect(Object.keys(files).sort()).toEqual(['cli.ts', 'mcp.ts', 'spec.json', 'types.ts']);
    for (const [name, content] of Object.entries(files)) {
      expect(read(name), `${name} 与跑 pnpm gen 的结果不同`).toBe(content);
    }
  });

  it('spec.json 每个能力都有 object 型 input/output schema', () => {
    const doc = buildSpecDoc() as {
      capabilities: { name: string; input: { type?: string }; output: { type?: string } }[];
    };
    expect(doc.capabilities).toHaveLength(CAPABILITY_NAMES.length);
    for (const cap of doc.capabilities) {
      expect(cap.input.type, cap.name).toBe('object');
      expect(cap.output.type, cap.name).toBe('object');
    }
  });

  it('mcp.ts 里每个 tool 的 inputSchema 都是 object', () => {
    const mcp = read('mcp.ts');
    const objects = mcp.match(/"type": "object"/g) ?? [];
    expect(objects.length).toBeGreaterThanOrEqual(14);
  });
});
