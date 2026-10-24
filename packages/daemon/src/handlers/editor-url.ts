import type { AutoOpenState } from '../context';

export function editorUrl(ctx: { baseUrl: string; token?: string }, roomId: string, focus?: string): string {
  const query = new URLSearchParams();
  if (focus) query.set('focus', focus);
  if (ctx.token) query.set('t', ctx.token);
  const qs = query.toString();
  return `${ctx.baseUrl}/editor/r/${roomId}${qs ? `?${qs}` : ''}`;
}

export function surfaceHint(
  ctx: {
    baseUrl: string;
    token?: string;
    surfaces?: (roomId: string) => number;
    autoOpen?: Map<string, AutoOpenState>;
  },
  roomId: string,
): string | undefined {
  if ((ctx.surfaces?.(roomId) ?? 0) > 0) return undefined;
  const url = editorUrl(ctx, roomId);
  switch (ctx.autoOpen?.get(roomId)) {
    case 'opened':
      return `编辑器窗口已自动打开（${url}），正在连接；不要再调用 vibe3d_open_editor 重复开窗，场景变更会自动推送到该窗口。`;
    case 'pending':
      return `编辑器窗口正在打开（${url}），稍等 1–2 秒即可看到画面；不要重复调用开窗工具。`;
    case 'failed':
      return `自动打开失败（${url}），请手动访问该地址查看画面。`;
    default:
      return `当前没有编辑器窗口连接（editors=0），改动已写入场景但看不到画面：调用 vibe3d_open_editor 打开 ${url} 即可实时观看。`;
  }
}
