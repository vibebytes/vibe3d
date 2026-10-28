export function assertNode(version: string): void {
  const raw = version.replace(/^v/, '');
  const major = Number(raw.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(
      `vibe3d 需要 Node.js >=20（与 MCP TypeScript SDK v2 一致），当前是 ${raw}。请把 MCP 宿主实际用到的默认 node/npx 升到 20+（官网安装包或 Homebrew；勿依赖 bash -lc + nvm，登录 bash 通常加载不到 zsh 里的 nvm）。`,
    );
  }
}
