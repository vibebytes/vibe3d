import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { vendorDecoders } from './vendor-decoders';

const daemon = process.env.VIBE3D_DAEMON_URL ?? 'http://127.0.0.1:5178';
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/editor/',
  plugins: [react(), tailwindcss(), vendorDecoders()],
  resolve: {
    alias: {
      '@vibebyte/vibe3d-scene': src('../scene/src/index.ts'),
      '@vibebyte/vibe3d-protocol': src('../protocol/src/index.ts'),
    },
  },
  server: {
    port: 5179,
    proxy: {
      '/rpc': daemon,
      '/health': daemon,
      '/r/': { target: daemon, ws: true },
      '/assets': daemon,
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
});
