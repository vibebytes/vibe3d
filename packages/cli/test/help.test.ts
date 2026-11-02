import { CLI_COMMANDS } from '@vibebyte/vibe3d-capabilities';
import { describe, expect, it } from 'vitest';
import { helpText } from '../src/help';

describe('cli help', () => {
  it('总览列出每条命令的 usage', () => {
    const text = helpText();
    for (const row of CLI_COMMANDS) expect(text).toContain(row.usage);
  });

  it('总览列出本地命令', () => {
    const text = helpText();
    expect(text).toContain('daemon');
    expect(text).toContain('call <method>');
    expect(text).toContain('job wait <jobId>');
  });

  it('详细帮助包含参数和示例', () => {
    const text = helpText(['anim', 'gait']);
    expect(text).toContain('参数');
    expect(text).toContain('示例');
    expect(text).toContain('vibe3d anim gait');
  });

  it('--help 与 help 命令输出相同', () => {
    expect(helpText(['anim', 'gait'])).toBe(helpText(['help', 'anim', 'gait']));
  });

  it('详细帮助列出同义命令', () => {
    expect(helpText(['room', 'ls'])).toContain('room list');
  });

  it('未知命令的帮助报错', () => {
    expect(() => helpText(['foo', 'bar'])).toThrow(/未知命令/);
  });
});
