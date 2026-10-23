import { mkdirSync } from 'node:fs';
import { BlobStore } from './src/assets/blobstore';
import { createIngest } from './src/assets/ingest';
import { parseConfig } from './src/config';
import { createLogger } from './src/logger';
import { RoomManager } from './src/rooms/manager';
import { createApp } from './src/server';

const config = parseConfig(['--port', '0', '--token', 'smoke-token-123', '--home', '/tmp/vibe3d-appcheck']);
mkdirSync('/tmp/vibe3d-appcheck/blobs', { recursive: true });
const logger = createLogger('error');
const rooms = new RoomManager({ maxRooms: 8, logger });
const blobs = new BlobStore('/tmp/vibe3d-appcheck/blobs');
const { ingest, inspect } = createIngest({ blobs });
const ctx = { rooms, baseUrl: 'http://127.0.0.1:1', ingest, inspect, selection: () => [] };
const app = createApp({ config, ctx, blobs, logger, editorDir: '/tmp' });

const res = await app.request('http://127.0.0.1:1/rpc', {
  method: 'POST',
  headers: { authorization: 'Bearer smoke-token-123', 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: {} }),
});
const text = await res.text();
console.log('hello length', text.length, 'content-length', res.headers.get('content-length'));
console.log(text.slice(0, 80), '...', text.slice(-40));
