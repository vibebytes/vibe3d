import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

const base = ['--token', 'test-token-1234'];

describe('parseConfig', () => {
  it('默认 gc 开启、7 天', () => {
    const c = parseConfig(base, {});
    expect(c.gc).toBe(true);
    expect(c.gcMaxAgeDays).toBe(7);
    expect(c.persist).toBe(false);
  });

  it('--gc=off 关闭', () => {
    expect(parseConfig([...base, '--gc=off'], {}).gc).toBe(false);
    expect(parseConfig([...base, '--gc=false'], {}).gc).toBe(false);
    expect(parseConfig([...base, '--gc', '0'], {}).gc).toBe(false);
  });

  it('--gc 裸开关保持开启', () => {
    expect(parseConfig([...base, '--gc'], {}).gc).toBe(true);
  });

  it('--gc-max-age=3 覆盖天数', () => {
    expect(parseConfig([...base, '--gc-max-age=3'], {}).gcMaxAgeDays).toBe(3);
    expect(parseConfig([...base, '--gc-max-age', '30'], {}).gcMaxAgeDays).toBe(30);
  });

  it('env 变量兜底，flag 优先', () => {
    expect(parseConfig(base, { VIBE3D_GC: 'off' }).gc).toBe(false);
    expect(parseConfig([...base, '--gc=on'], { VIBE3D_GC: 'off' }).gc).toBe(true);
  });

  it('--persist=false 显式关闭', () => {
    expect(parseConfig([...base, '--persist=false'], {}).persist).toBe(false);
    expect(parseConfig([...base, '--persist'], {}).persist).toBe(true);
  });

  it('非法 gc-max-age 报错', () => {
    expect(() => parseConfig([...base, '--gc-max-age=0'], {})).toThrow(/配置非法/);
  });
});

describe('parseConfig：token 可选（默认无鉴权）', () => {
  it('不提供 token 时为 undefined（鉴权关闭）', () => {
    expect(parseConfig([], {}).token).toBeUndefined();
  });

  it('显式 --token 仍然生效', () => {
    expect(parseConfig(['--token', 'abcd1234'], {}).token).toBe('abcd1234');
  });

  it('VIBE3D_TOKEN 仍然生效', () => {
    expect(parseConfig([], { VIBE3D_TOKEN: 'abcd1234' }).token).toBe('abcd1234');
  });
});
