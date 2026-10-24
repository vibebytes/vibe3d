import type { FxSpec } from '@vibebyte/vibe3d-protocol';

export interface ParticleSample {
  position: [number, number, number];
  alpha: number;
  size: number;
}

export const MAX_PARTICLES = 2000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function particleCount(fx: FxSpec): number {
  const count = Math.round((fx.rate ?? 20) * (fx.life ?? 2));
  return Math.min(MAX_PARTICLES, Math.max(1, count));
}

export function sampleParticles(fx: FxSpec, t: number): ParticleSample[] {
  const count = particleCount(fx);
  const life = Math.max(fx.life ?? 2, 1e-6);
  const spread = fx.spread ?? ([2, 0, 2] as [number, number, number]);
  const gravity = fx.gravity ?? ([0, -9.8, 0] as [number, number, number]);
  const speed = fx.speed ?? 1;
  const base = fx.position ?? ([0, 0, 0] as [number, number, number]);
  const size = fx.size ?? 0.1;
  const out: ParticleSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const rand = mulberry32((fx.seed ?? 7) + i * 2654435761);
    const offset = (i / count) * life;
    const age = (((t + offset) % life) + life) % life;
    const x0 = base[0] + (rand() - 0.5) * spread[0];
    const y0 = base[1] + (rand() - 0.5) * spread[1];
    const z0 = base[2] + (rand() - 0.5) * spread[2];
    const vx = (rand() - 0.5) * 2 * speed;
    const vy = (rand() - 0.5) * 2 * speed;
    const vz = (rand() - 0.5) * 2 * speed;
    out.push({
      position: [
        x0 + vx * age + 0.5 * gravity[0] * age * age,
        y0 + vy * age + 0.5 * gravity[1] * age * age,
        z0 + vz * age + 0.5 * gravity[2] * age * age,
      ],
      alpha: Math.max(0, Math.min(1, 1 - age / life)),
      size,
    });
  }
  return out;
}
