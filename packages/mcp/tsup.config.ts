import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema-cli.ts'],
  format: ['esm'],
  target: 'node20',
  noExternal: [/^@vibebyte\//],
  clean: true,
});
