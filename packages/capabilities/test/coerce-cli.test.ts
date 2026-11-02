import { fogSchema } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceForSchema } from '../src/coerce';

const cli = { mode: 'cli' as const };
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const rect = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

describe('coerce cli text', () => {
  it('C1 逗号列表转元组', () => {
    expect(coerceForSchema(vec3, '1,0,0', cli)).toEqual([1, 0, 0]);
  });

  it('C1 逗号列表转字符串数组', () => {
    expect(coerceForSchema(z.array(z.string()), 'a,b', cli)).toEqual(['a', 'b']);
  });

  it('C2 分号列表转元组数组', () => {
    expect(coerceForSchema(z.array(vec3), '0,0,0;0,1,0', cli)).toEqual([
      [0, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('C2+C3 分号列表转对象数组', () => {
    const point = z.object({ x: z.number(), y: z.number() });
    expect(coerceForSchema(z.array(point), '10,20;30,40', cli)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('C3 数字列表按必填键顺序转对象', () => {
    expect(coerceForSchema(fogSchema, '5,40', cli)).toEqual({ near: 5, far: 40 });
  });

  it('C3 个数不符时报错', () => {
    expect(() => coerceForSchema(rect, '0,0,200', cli)).toThrow(/需要 4 个数字/);
  });

  it('C4 @文件仅对对象类字段生效', () => {
    const seen: string[] = [];
    const ops = z.array(z.object({ op: z.string() }));
    const value = coerceForSchema(ops, '@x.json', {
      ...cli,
      readFile: (path) => {
        seen.push(path);
        return '[{"op":"node.delete"}]';
      },
    });
    expect(seen).toEqual(['x.json']);
    expect(value).toEqual([{ op: 'node.delete' }]);
  });

  it('C4 字符串数组不读文件', () => {
    const seen: string[] = [];
    const value = coerceForSchema(z.array(z.string()), '@runner', {
      ...cli,
      readFile: (path) => {
        seen.push(path);
        return 'nope';
      },
    });
    expect(value).toEqual(['@runner']);
    expect(seen).toEqual([]);
  });

  it('C5 --no-x 让可空对象为 null', () => {
    expect(coerceForSchema(fogSchema.nullable(), false, cli)).toBeNull();
  });

  it('C6 字面量 null', () => {
    expect(coerceForSchema(z.string().nullable(), 'null', cli)).toBeNull();
  });

  it('C7 布尔文本', () => {
    expect(coerceForSchema(z.boolean(), 'false', cli)).toBe(false);
    expect(coerceForSchema(z.boolean(), true, cli)).toBe(true);
  });

  it('MCP 模式不受影响', () => {
    expect(coerceForSchema(vec3, '1,0,0')).toBe('1,0,0');
  });

  it('转换失败带字段路径', () => {
    const schema = z.object({ fog: z.object({ near: z.number(), far: z.number() }) });
    expect(() => coerceForSchema(schema, { fog: { near: 'nope', far: 1 } }, cli)).toThrow(/fog\.near/);
  });
});
