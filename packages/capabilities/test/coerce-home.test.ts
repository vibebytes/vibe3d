import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceForSchema, defOf, unwrap } from '../src/index';

describe('coerce home', () => {
  it('coerceForSchema 从 capabilities 包导出', () => {
    const rgba = z.tuple([z.number(), z.number(), z.number(), z.number()]);
    expect(coerceForSchema(rgba, '#ff0000')).toEqual([1, 0, 0, 1]);
  });

  it('unwrap 剥离 optional/nullable/default/effects', () => {
    expect(defOf(unwrap(z.string().optional().nullable())).typeName).toBe('ZodString');
    expect(defOf(unwrap(z.number().default(1))).typeName).toBe('ZodNumber');
    expect(defOf(unwrap(z.string().transform((value) => value.trim()))).typeName).toBe('ZodString');
  });
});
