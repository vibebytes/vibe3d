import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema-cli.ts'],
  format: ['esm'],
  target: 'node20',
  noExternal: [/.*/],
  splitting: false,
  banner: {
    js: "import { createRequire as __vibeCreateRequire } from 'node:module'; const require = __vibeCreateRequire(import.meta.url);",
  },
  clean: true,
});
