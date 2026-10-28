import { readFileSync } from 'node:fs';
import { DAEMON_VERSION } from '@vibebyte/vibe3d-protocol';
import { describe, expect, it } from 'vitest';
import { mcpVersion } from '../src/version';
import { connectClient } from './helpers/client';

describe('版本与包一致', () => {
  it('serverInfo.version 等于 mcp 包版本', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    const { client } = await connectClient({
      runtime: async () => {
        throw new Error('x');
      },
    });
    expect(client.getServerVersion()?.version).toBe(pkg.version);
    expect(mcpVersion()).toBe(pkg.version);
  });

  it('DAEMON_VERSION 等于 daemon 包版本', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../daemon/package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(DAEMON_VERSION).toBe(pkg.version);
  });
});
