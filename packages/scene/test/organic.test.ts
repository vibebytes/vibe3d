import { describe, expect, it } from 'vitest';
import { organicMesh } from '../src/sculpt';

describe('organicMesh', () => {
  it('相同 seed 字节稳定，flatBottom 贴 y=0，无 flatBottom 时离开椭球', () => {
    const a = organicMesh({ radius: [0.6, 1, 0.5], seed: 7, amplitude: 0.15, segments: 10 });
    const b = organicMesh({ radius: [0.6, 1, 0.5], seed: 7, amplitude: 0.15, segments: 10 });
    expect(a.positions).toEqual(b.positions);
    const flat = organicMesh({
      radius: [0.6, 1, 0.5],
      seed: 7,
      amplitude: 0.15,
      segments: 10,
      flatBottom: true,
    });
    expect(flat.bbox.min[1]).toBe(0);
    const plain = organicMesh({ radius: [0.6, 1, 0.5], seed: 3, amplitude: 0, segments: 8 });
    const moved = organicMesh({ radius: [0.6, 1, 0.5], seed: 3, amplitude: 0.2, segments: 8 });
    const delta = moved.positions.some((value, i) => Math.abs(value - plain.positions[i]!) > 0.02);
    expect(delta).toBe(true);
  });
});
