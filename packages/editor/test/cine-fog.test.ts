import { describe, expect, it } from 'vitest';
import { cineLook } from '../src/three/stage';

describe('电影预设的雾', () => {
  it('推荐 fog.near >= 80，近景虚化只来自 dof', () => {
    expect(cineLook.fog.near).toBeGreaterThanOrEqual(80);
    expect(cineLook.blur).toBe('dof');
  });
});
