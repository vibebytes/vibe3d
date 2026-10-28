import type { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { logEvent } from './log';

// stdin 到达 EOF 时，官方 StdioServerTransport 会中止进行中的请求且不再回答。
// 规范要求期望响应的客户端在读完响应前保持 stdin 打开。
export async function startStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  const bootPpid = process.ppid;
  const hb = setInterval(() => {
    if (process.ppid !== bootPpid) {
      logEvent({ event: 'orphan.exit', bootPpid, ppid: process.ppid });
      process.exit(0);
    }
    logEvent({ event: 'hb', rss: process.memoryUsage().rss });
  }, 30_000);
  hb.unref?.();
  logEvent({
    event: 'boot',
    pid: process.pid,
    ppid: process.ppid,
    node: process.version,
    entry: process.argv[1] ?? '',
  });
  await server.connect(transport);
}
