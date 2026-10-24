import { describe, expect, it } from 'vitest';
import { geometrySchema, legacyGeometryNotes } from '../src/schema';

describe('geometry cylinder radius alias', () => {
  it('radius 展开成上下同半径，输出不带 radius 键', () => {
    const g = geometrySchema.parse({ type: 'cylinder', radius: 0.4, height: 2, segments: 24 });
    expect(g).toEqual({ type: 'cylinder', radiusTop: 0.4, radiusBottom: 0.4, height: 2, segments: 24 });
    expect('radius' in g).toBe(false);
  });

  it('显式 radiusTop/radiusBottom 保持不变（圆锥/圆台）', () => {
    const g = geometrySchema.parse({
      type: 'cylinder',
      radiusTop: 0,
      radiusBottom: 0.6,
      height: 1.5,
      segments: 12,
    });
    expect(g).toEqual({ type: 'cylinder', radiusTop: 0, radiusBottom: 0.6, height: 1.5, segments: 12 });
  });

  it('radius 与 radiusTop/radiusBottom 混用直接报错', () => {
    const res = geometrySchema.safeParse({
      type: 'cylinder',
      radius: 0.4,
      radiusTop: 0.2,
      height: 2,
      segments: 24,
    });
    expect(res.success).toBe(false);
  });

  it('两者都不给时报错', () => {
    const res = geometrySchema.safeParse({ type: 'cylinder', height: 2, segments: 24 });
    expect(res.success).toBe(false);
  });

  it('非圆柱不受影响', () => {
    expect(geometrySchema.parse({ type: 'sphere', radius: 1, segments: 32 })).toEqual({
      type: 'sphere',
      radius: 1,
      segments: 32,
    });
  });
});

describe('legacyGeometryNotes', () => {
  it('只在 raw ops 用 radius 时给迁移提示，可重复定位到节点', () => {
    expect(legacyGeometryNotes({})).toEqual([]);
    const notes = legacyGeometryNotes({
      ops: [
        {
          op: 'node.create',
          node: { id: 'n_abcdefgh', geometry: { type: 'cylinder', radius: 0.4, height: 2, segments: 24 } },
        },
        {
          op: 'node.update',
          id: 'n_abcdefgi',
          patch: {
            geometry: { type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 1, segments: 8 },
          },
        },
      ],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('n_abcdefgh');
    expect(notes[0]).toContain('radiusTop');
  });
});
