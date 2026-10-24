import { spawn } from 'node:child_process';

const child = spawn('node', ['packages/mcp/dist/index.js'], {
  cwd: '/Users/kai/iwork/code/work/quant/agent_work/vibe3d',
  env: { ...process.env, VIBE3D_HOME: '.devhome' },
});
let buf = '';
let sentList = false;
const send = (o) => child.stdin.write(`${JSON.stringify(o)}\n`);

child.stdout.on('data', (d) => {
  buf += d.toString();
  for (const line of buf.split('\n')) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1 && !sentList) {
      sentList = true;
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    }
    if (msg.id === 2) {
      const tools = msg.result.tools;
      const all = JSON.stringify(tools).length;
      const sizes = tools.map((t) => [t.name, JSON.stringify(t).length]).sort((a, b) => b[1] - a[1]);
      console.log('tools', tools.length);
      console.log('list bytes', all);
      console.log('top', sizes.slice(0, 6));
      console.log('top1 share', (sizes[0][1] / all).toFixed(2));
      console.log('no description', tools.filter((t) => !t.description).length);
      console.log('desc avg chars', Math.round(tools.reduce((s, t) => s + (t.description ?? '').length, 0) / tools.length));
      child.kill();
      process.exit(0);
    }
  }
});
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'measure', version: '1' } } });
setTimeout(() => { console.error('timeout'); child.kill(); process.exit(1); }, 20000);
