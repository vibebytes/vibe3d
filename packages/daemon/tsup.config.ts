import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm'],
  target: 'node22',
  noExternal: [/.*/],
  splitting: false,
  banner: {
    js: "import { createRequire as __vibeCreateRequire } from 'node:module'; const require = __vibeCreateRequire(import.meta.url);",
  },
  dts: true,
  clean: true,
});
