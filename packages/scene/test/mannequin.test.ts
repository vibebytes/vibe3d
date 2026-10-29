import { describe, expect, it } from 'vitest';
import { mannequinMesh } from '../src/mannequin';

describe('mannequinMesh', () => {
  it('jog_away 的头肩髋高度比落在区间，衣服与身体是两块网格', () => {
    const fig = mannequinMesh({ pose: 'jog_away', seed: 3 });
    const { head, shoulder, hip } = fig.landmarks;
    expect(head / 1.8).toBeGreaterThan(0.88);
    expect(head / 1.8).toBeLessThan(0.96);
    expect(shoulder / head).toBeGreaterThan(0.8);
    expect(shoulder / head).toBeLessThan(0.92);
    expect(hip / head).toBeGreaterThan(0.5);
    expect(hip / head).toBeLessThan(0.65);
    const near = (mesh: { positions: number[] }, y: number) =>
      mesh.positions.some((value, i) => i % 3 === 1 && Math.abs(value - y) < 0.08);
    expect(near(fig.body, head)).toBe(true);
    expect(near(fig.body, shoulder)).toBe(true);
    expect(near(fig.body, hip)).toBe(true);
    expect(fig.cloth.positions.length).toBeGreaterThan(0);
    expect(fig.cloth).not.toBe(fig.body);
  });
});
