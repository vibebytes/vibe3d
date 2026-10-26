import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/flags';

describe('parseFlags 布尔键', () => {
  it('--autostart false 解析为布尔 false', () => {
    expect(parseFlags(['--autostart', 'false'])).toEqual({ autostart: false });
  });

  it('--autostart true 解析为布尔 true', () => {
    expect(parseFlags(['--autostart', 'true'])).toEqual({ autostart: true });
  });

  it('裸布尔键为 true，不吞并后续参数', () => {
    expect(parseFlags(['--persist', '--home', '/x'])).toEqual({ persist: true, home: '/x' });
  });

  it('--open-editor false 解析为布尔 false', () => {
    expect(parseFlags(['--open-editor', 'false'])).toEqual({ 'open-editor': false });
  });

  it('非布尔键的值保持字符串', () => {
    expect(parseFlags(['--home', '/tmp/x'])).toEqual({ home: '/tmp/x' });
  });

  it('重复键取最后一次', () => {
    expect(parseFlags(['--url', 'http://a', '--url', 'http://b'])).toEqual({ url: 'http://b' });
  });
});
