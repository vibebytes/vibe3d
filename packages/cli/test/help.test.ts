import { describe, expect, it } from 'vitest';
import { HELP } from '../src/help';

describe('cli help', () => {
  it('列出全部命令组与新增子命令', () => {
    for (const line of [
      'scene export <roomId>',
      'scene import <roomId>',
      'scene checkpoint <roomId>',
      'scene restore <roomId>',
      'node clone <roomId>',
      'asset put <roomId>',
      'asset ls <roomId>',
      'asset rm <roomId>',
      'job wait <jobId>',
      '[--shading flat|wireframe|normals|material|rendered]',
      '[--overlay grid,axes,bbox,ground,centerline,scale,normal,dims]',
      'render views <roomId>',
      'render node <roomId>',
      'render pick <roomId>',
      'asset put <roomId> <src> [--kind auto|image|hdri|model]',
      'env set <roomId> [--hdri <src>]',
      'decal create <roomId>',
      'mesh boolean <roomId>',
    ]) {
      expect(HELP).toContain(line);
    }
  });
});
