import { describe, expect, it } from 'vitest';
import { chromeArgs } from '../src/render/chrome';

describe('chromeArgs', () => {
  it('keeps the real GPU angle on macOS while allowing software fallback', () => {
    const args = chromeArgs('/tmp/profile', { platform: 'darwin' });
    expect(args).toContain('--headless=new');
    expect(args).toContain('--user-data-dir=/tmp/profile');
    expect(args).toContain('--enable-unsafe-swiftshader');
    expect(args).not.toContain('--use-angle=swiftshader');
  });

  it('forces swiftshader on linux or via explicit override', () => {
    expect(chromeArgs('/tmp/p', { platform: 'linux' })).toContain('--use-angle=swiftshader');
    expect(chromeArgs('/tmp/p', { platform: 'win32' })).not.toContain('--use-angle=swiftshader');
    expect(chromeArgs('/tmp/p', { platform: 'darwin', forceSwiftShader: true })).toContain(
      '--use-angle=swiftshader',
    );
  });

  it('appends no-sandbox flags when requested', () => {
    const args = chromeArgs('/tmp/p', { noSandbox: true, platform: 'darwin' });
    expect(args).toContain('--no-sandbox');
    expect(args).toContain('--disable-gpu-sandbox');
    expect(chromeArgs('/tmp/p', { platform: 'darwin' })).not.toContain('--no-sandbox');
  });
});
