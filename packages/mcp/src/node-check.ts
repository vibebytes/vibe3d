export function assertNode(version: string): void {
  const raw = version.replace(/^v/, '');
  const major = Number(raw.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) {
    throw new Error(
      `vibe3d 需要 Node.js >=22，当前是 ${raw}。请安装 Node 22 后再启动（例如 nvm install 22，或把 MCP command 指到 Node 22 的绝对路径）。`,
    );
  }
}
