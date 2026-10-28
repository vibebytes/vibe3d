import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPrompt, listPrompts } from '../src/guide';
import { schemaSnapshot } from '../src/schema';
import { listTools } from '../src/tools';

const golden = (name: string) =>
  JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8'));

describe('tools/list 与 prompts 黄金文件', () => {
  it('tools/list 与黄金文件逐字段相同，并与 schema 快照一致', () => {
    expect(listTools()).toEqual(golden('tools-list.json'));
    expect(schemaSnapshot().tools).toEqual(listTools());
  });

  it('prompts/list 与 vibe3d.build 与黄金文件相同', () => {
    const saved = golden('prompts.json') as { list: unknown; build: unknown };
    expect(listPrompts()).toEqual(saved.list);
    expect(getPrompt('vibe3d.build')).toEqual(saved.build);
  });
});
