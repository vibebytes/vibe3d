const ID_HINTS: Record<string, string> = {
  'invalid material id':
    '材质 id 形如 m_ + 8 位小写字母数字（如 m_a1b2c3d4）；也可省略 id，直接用 vibe3d_create_material 让服务端生成',
  'invalid node id':
    '节点 id 形如 n_ + 8 位小写字母数字（如 n_a1b2c3d4）；新建节点请用 vibe3d_create_node（服务端生成 id）',
  'invalid fx id':
    '特效 id 形如 f_ + 8 位小写字母数字（如 f_a1b2c3d4）；新建特效请用 vibe3d_create_fx（服务端生成 id）',
  'invalid room id': '房间 id 形如 r_ + 8 位小写字母数字（如 r_a1b2c3d4）',
  'invalid sha256': 'sha256 需要 64 位小写十六进制；上传素材用 vibe3d_put_asset 拿 sha',
};

const COLOUR_KEYS = new Set(['color', 'background', 'ambient', 'baseColor', 'emissive']);

export function paramHint(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): string {
  for (const issue of issues) {
    const idHint = ID_HINTS[issue.message.trim()];
    if (idHint) return `；${idHint}`;
    if (/Invalid discriminator value/.test(issue.message)) {
      return '；kind 必须是 group / mesh / light / model 之一；基础体直接用 vibe3d_create_node 更省事';
    }
    const last = String(issue.path[issue.path.length - 1] ?? '');
    if (COLOUR_KEYS.has(last) && /at least 4/.test(issue.message)) {
      return '；颜色一律 [r,g,b,a]，0..1 四位（3 位会自动补 alpha=1；也接受 "#RRGGBB"）';
    }
  }
  return '';
}
