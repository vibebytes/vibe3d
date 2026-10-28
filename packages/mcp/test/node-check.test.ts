import { describe, expect, it } from 'vitest';
import { assertNode } from '../src/node-check';

describe('assertNode', () => {
  it('拒绝 18 并提示升级到 >=20', () => {
    expect(() => assertNode('18.20.8')).toThrow(/>=20/);
    expect(() => assertNode('v18.20.8')).toThrow(/Node\.js >=20/);
  });

  it('接受 20 与 22', () => {
    expect(() => assertNode('20.19.0')).not.toThrow();
    expect(() => assertNode('22.19.0')).not.toThrow();
  });
});
