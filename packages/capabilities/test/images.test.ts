import { describe, expect, it } from 'vitest';
import { imagePayloads } from '../src/images';

describe('imagePayloads', () => {
  it('找到嵌套的 base64 载荷并给出路径', () => {
    const value = {
      shots: [{ view: 'front', base64: 'aaa', mime: 'image/png', width: 2 }],
    };
    expect(imagePayloads(value)).toEqual([
      { path: ['shots', 0], base64: 'aaa', mime: 'image/png', label: 'front' },
    ]);
  });
});
