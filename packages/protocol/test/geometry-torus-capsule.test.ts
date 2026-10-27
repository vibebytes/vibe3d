import { describe, expect, it } from 'vitest';
import { geometrySchema } from '../src/schema';

describe('geometry torus', () => {
  it('解析 radius(R)/tube(r)/segments，segments 为环向份数', () => {
    expect(geometrySchema.parse({ type: 'torus', radius: 1, tube: 0.25, segments: 48 })).toEqual({
      type: 'torus',
      radius: 1,
      tube: 0.25,
      segments: 48,
    });
  });

  it('segments 默认 32', () => {
    expect(geometrySchema.parse({ type: 'torus', radius: 1, tube: 0.25 })).toEqual({
      type: 'torus',
      radius: 1,
      tube: 0.25,
      segments: 32,
    });
  });

  it('tube_radius 别名归一为 tube', () => {
    expect(geometrySchema.parse({ type: 'torus', radius: 1, tube_radius: 0.3, segments: 24 })).toEqual({
      type: 'torus',
      radius: 1,
      tube: 0.3,
      segments: 24,
    });
  });

  it('tube >= radius 报错（自交环）', () => {
    expect(geometrySchema.safeParse({ type: 'torus', radius: 0.3, tube: 0.3 }).success).toBe(false);
    expect(geometrySchema.safeParse({ type: 'torus', radius: 0.2, tube: 0.5, segments: 16 }).success).toBe(
      false,
    );
  });

  it('radius/tube 必须为正', () => {
    expect(geometrySchema.safeParse({ type: 'torus', radius: 0, tube: 0.1 }).success).toBe(false);
    expect(geometrySchema.safeParse({ type: 'torus', radius: 1, tube: -0.1 }).success).toBe(false);
  });
});

describe('geometry capsule', () => {
  it('解析 radius/height/segments，height 为圆柱中段长度（总高 = height + 2*radius）', () => {
    expect(geometrySchema.parse({ type: 'capsule', radius: 0.5, height: 1.5, segments: 24 })).toEqual({
      type: 'capsule',
      radius: 0.5,
      height: 1.5,
      segments: 24,
    });
  });

  it('segments 默认 32', () => {
    expect(geometrySchema.parse({ type: 'capsule', radius: 0.5, height: 1 })).toEqual({
      type: 'capsule',
      radius: 0.5,
      height: 1,
      segments: 32,
    });
  });

  it('radius/height 必须为正', () => {
    expect(geometrySchema.safeParse({ type: 'capsule', radius: 0, height: 1 }).success).toBe(false);
    expect(geometrySchema.safeParse({ type: 'capsule', radius: 0.5, height: -1 }).success).toBe(false);
  });
});
