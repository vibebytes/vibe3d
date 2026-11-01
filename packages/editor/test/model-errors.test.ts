import { beforeEach, describe, expect, it } from 'vitest';
import { useModelErrors } from '../src/stores/modelErrors';

describe('useModelErrors', () => {
  beforeEach(() => {
    useModelErrors.getState().reset();
  });

  it('reports and clears per-node load errors', () => {
    useModelErrors.getState().report('n1', 'sha1', 'Failed to fetch');
    expect(useModelErrors.getState().errors.n1).toEqual({
      nodeId: 'n1',
      sha: 'sha1',
      message: 'Failed to fetch',
    });

    useModelErrors.getState().clear('n1');
    expect(useModelErrors.getState().errors.n1).toBeUndefined();
  });

  it('overwrites repeated reports for the same node', () => {
    useModelErrors.getState().report('n1', 'sha1', 'first');
    useModelErrors.getState().report('n1', 'sha1', 'second');
    expect(useModelErrors.getState().errors.n1?.message).toBe('second');
    expect(Object.keys(useModelErrors.getState().errors)).toHaveLength(1);
  });

  it('tracks errors per node independently', () => {
    useModelErrors.getState().report('n1', 'sha1', 'first');
    useModelErrors.getState().report('n2', 'sha2', 'second');
    useModelErrors.getState().clear('n1');
    expect(useModelErrors.getState().errors.n1).toBeUndefined();
    expect(useModelErrors.getState().errors.n2?.message).toBe('second');
  });

  it('bumps retry counters per node', () => {
    expect(useModelErrors.getState().retries.n1).toBeUndefined();
    useModelErrors.getState().retry('n1');
    useModelErrors.getState().retry('n1');
    useModelErrors.getState().retry('n2');
    expect(useModelErrors.getState().retries.n1).toBe(2);
    expect(useModelErrors.getState().retries.n2).toBe(1);
  });

  it('reset clears errors and retries', () => {
    useModelErrors.getState().report('n1', 'sha1', 'boom');
    useModelErrors.getState().retry('n1');
    useModelErrors.getState().reset();
    expect(useModelErrors.getState().errors).toEqual({});
    expect(useModelErrors.getState().retries).toEqual({});
  });
});
