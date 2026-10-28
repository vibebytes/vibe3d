export function assertNode(version: string): void {
  const raw = version.replace(/^v/, '');
  const major = Number(raw.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(
      `vibe3d 需要 Node.js >=20（与 MCP TypeScript SDK v2 一致），当前是 ${raw}。请安装 Node 20+，并把 MCP 宿主用到的默认 node/npx 升到 20+（官网安装包、Homebrew，或 nvm/fnm/volta 的 default）。GUI（Cursor 等）常读不到交互 shell 的 PATH；可用 bash -lc "nvm use 20 && npx -y @vibebyte/vibe3d-mcp" 或 volta run --node 20 -- npx -y @vibebyte/vibe3d-mcp。`,
    );
  }
}
