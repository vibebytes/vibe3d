import { describe, expect, it } from 'vitest';
import { assertNode } from '../src/node-check';

describe('Node 版本前置检查', () => {
  it('拒绝 18 并提示升级到 >=22', () => {
    expect(() => assertNode('18.20.8')).toThrow(/>=22/);
    expect(() => assertNode('v18.20.8')).toThrow(/Node 22/);
  });

  it('接受 22', () => {
    expect(() => assertNode('22.19.0')).not.toThrow();
  });
});
