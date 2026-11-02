import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceForSchema } from '../src/index';

describe('coerce home', () => {
  it('coerceForSchema 从 capabilities 包导出', () => {
    const rgba = z.tuple([z.number(), z.number(), z.number(), z.number()]);
    expect(coerceForSchema(rgba, '#ff0000')).toEqual([1, 0, 0, 1]);
  });
});
