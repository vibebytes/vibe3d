import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@vibebyte/vibe3d-protocol': at('./packages/protocol/src/index.ts'),
      '@vibebyte/vibe3d-scene': at('./packages/scene/src/index.ts'),
      '@vibebyte/vibe3d-capabilities': at('./packages/capabilities/src/index.ts'),
      '@vibebyte/vibe3d-client': at('./packages/client/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['packages/daemon/src/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
