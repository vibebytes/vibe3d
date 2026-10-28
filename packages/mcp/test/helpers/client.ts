import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { type ServerDeps, createServer } from '../../src/server';

export async function connectClient(deps: ServerDeps) {
  const server = createServer(deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'vibe3d-test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}
