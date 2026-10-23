import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm'],
  target: 'node20',
  noExternal: [/^@vibebyte\//],
  dts: true,
  clean: true,
});
