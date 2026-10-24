import { emptyDoc } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { parseSceneDoc } from '../src/scene-io';

describe('cli scene-io', () => {
  it('合法文档原样解析', () => {
    const doc = emptyDoc('cli');
    const parsed = parseSceneDoc(JSON.stringify(doc), 'doc.json');
    expect(parsed.name).toBe('cli');
    expect(parsed.roots).toEqual([]);
  });

  it('非 JSON 给出文件名与原因', () => {
    expect(() => parseSceneDoc('{oops', 'doc.json')).toThrow(/doc\.json 不是合法 JSON/);
  });

  it('结构不合法指出字段路径', () => {
    const doc = emptyDoc('broken') as unknown as Record<string, unknown>;
    delete doc.revision;
    expect(() => parseSceneDoc(JSON.stringify(doc), 'broken.json')).toThrow(
      /broken\.json 文档结构不合法：revision/,
    );
  });
});
