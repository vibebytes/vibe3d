import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, ERROR_SPECS } from '../src/errors';

describe('K2 AppError.hint 单一出口', () => {
  it('常见错误自带可用 hint，不需要调用方手写', () => {
    expect(new AppError('E_NODE_NOT_FOUND').toJSON().data?.hint).toContain('id');
    expect(new AppError('E_CONFLICT').toJSON().data?.hint).toContain('baseRevision');
    expect(new AppError('E_MATERIAL_IN_USE').toJSON().data?.hint).toContain('force');
  });

  it('调用方显式 hint 优先于默认值', () => {
    const err = new AppError('E_NODE_NOT_FOUND', undefined, { hint: '自定义提示', nodeId: 'n_1' });
    const data = err.toJSON().data;
    expect(data?.hint).toBe('自定义提示');
    expect(data?.nodeId).toBe('n_1');
  });

  it('没有默认 hint 的错误不凭空多出 data', () => {
    const json = new AppError('E_PARSE').toJSON();
    expect(json.data).toBeUndefined();
    expect('hint' in json).toBe(false);
  });

  it('默认 hint 不影响原始 data，只由 toJSON 出口补齐', () => {
    const err = new AppError('E_CONFLICT', undefined, { expectRevision: 1 });
    expect(err.data).toEqual({ expectRevision: 1 });
    expect(err.hint).toContain('baseRevision');
    expect(err.toJSON().data).toMatchObject({ expectRevision: 1 });
  });

  it('hint 覆盖所有可自愈错误，且都在一句话内', () => {
    const actionable = ERROR_CODES.filter((code) => ERROR_SPECS[code].hint !== undefined);
    expect(actionable.length).toBeGreaterThanOrEqual(8);
    for (const code of actionable) {
      const hint = ERROR_SPECS[code].hint ?? '';
      expect(hint.length, code).toBeLessThanOrEqual(80);
      expect(hint, code).not.toMatch(/[。.]$/);
    }
  });

  it('code / message / retryable 仍在顶层，形状不变', () => {
    const json = new AppError('E_CONFLICT').toJSON();
    expect(Object.keys(json).sort()).toEqual(['code', 'data', 'message', 'retryable']);
    expect(json.code).toBe('E_CONFLICT');
    expect(json.retryable).toBe(true);
  });
});
