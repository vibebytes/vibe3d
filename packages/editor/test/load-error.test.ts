import { describe, expect, it } from 'vitest';
import { isLoadError } from '../src/common/loadError';

describe('isLoadError', () => {
  it('matches network-level asset failures', () => {
    expect(isLoadError('Could not load /assets/528e7369: Failed to fetch')).toBe(true);
    expect(isLoadError('Failed to fetch')).toBe(true);
    expect(isLoadError('Failed to fetch dynamically imported module: http://x/y.js')).toBe(true);
    expect(isLoadError('load failed')).toBe(true);
    expect(isLoadError('Fetch failed')).toBe(true);
    expect(isLoadError('net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1')).toBe(true);
  });

  it('ignores plain scene errors', () => {
    expect(isLoadError('非法 sha')).toBe(false);
    expect(isLoadError('Cannot read properties of undefined (reading id)')).toBe(false);
  });
});
