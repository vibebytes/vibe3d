import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();
app.get('/', (c) => c.json({ a: 'x'.repeat(500) }));

const local = await app.request('/');
console.log('in-process length', (await local.text()).length);

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 18790 }, () => {
  fetch('http://127.0.0.1:18790/')
    .then(async (res) => {
      const text = await res.text();
      console.log('http length', text.length, 'content-length', res.headers.get('content-length'));
      server.close();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
});
