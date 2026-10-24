import { describe, expect, it } from 'vitest';
import { sampleParticles } from '../src/fx';

const particles = (o: Record<string, unknown> = {}): any => ({
  id: 'f_00000001',
  type: 'particles',
  position: [0, 0, 0],
  spread: [2, 0, 2],
  rate: 20,
  life: 2,
  size: 0.1,
  color: [1, 1, 1, 1],
  gravity: [0, -9.8, 0],
  speed: 1,
  billboard: true,
  seed: 7,
  ...o,
});

describe('粒子采样', () => {
  it('默认数量 = clamp(rate × life)', () => {
    expect(sampleParticles(particles(), 0)).toHaveLength(40);
    expect(sampleParticles(particles({ rate: 1000, life: 10 }), 0)).toHaveLength(2000);
    expect(sampleParticles(particles({ rate: 1, life: 0.1 }), 0)).toHaveLength(1);
  });

  it('同参数两次结果全等，不同 t 不同', () => {
    const fx = particles();
    expect(sampleParticles(fx, 0.7)).toEqual(sampleParticles(fx, 0.7));
    expect(sampleParticles(fx, 0.7)).not.toEqual(sampleParticles(fx, 1.4));
  });

  it('同 seed 可复现，换 seed 改变分布', () => {
    const a = sampleParticles(particles({ seed: 7 }), 0.3);
    const b = sampleParticles(particles({ seed: 8 }), 0.3);
    expect(a[0]?.position).not.toEqual(b[0]?.position);
  });

  it('alpha 落在 [0,1]，且按 life 周期循环', () => {
    for (const p of sampleParticles(particles(), 1.2)) {
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
    }
    const one = (t: number) => sampleParticles(particles({ rate: 1, life: 4 }), t)[0]!.alpha;
    expect(one(0)).toBeCloseTo(one(4), 9);
    expect(one(1.3)).toBeCloseTo(one(5.3), 9);
  });

  it('重力把粒子往下拉，零重力则只沿初速漂移', () => {
    const withG = sampleParticles(particles(), 0.5)[0]!.position;
    const noG = sampleParticles(particles({ gravity: [0, 0, 0] }), 0.5)[0]!.position;
    expect(withG[1]).toBeLessThan(noG[1]);
  });

  it('位置全部有限且落在扩散盒附近', () => {
    for (const p of sampleParticles(particles({ speed: 2, life: 3 }), 0.9)) {
      for (const v of p.position) expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(p.position[0])).toBeLessThan(2 + 2 * 3 + 1);
      expect(Math.abs(p.position[2])).toBeLessThan(2 + 2 * 3 + 1);
    }
  });
});
