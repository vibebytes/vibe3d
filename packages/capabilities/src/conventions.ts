export interface ConventionEntry {
  key: string;
  text: string;
}

export const GLOBAL_CONVENTIONS: readonly ConventionEntry[] = [
  { key: 'world', text: '世界系右手、Y 轴向上；长度单位一律米' },
  { key: 'angle', text: '角度一律弧度（transform.r 与贴图 rotation 同域，45°=0.7854）' },
  { key: 'fov', text: '例外：camera.fov 为垂直视野、单位度；lens_mm 按 36mm 传感器换算' },
  { key: 'color', text: '颜色一律 [r,g,b,a] 0..1，缺 alpha 补 1；也接受 "#RRGGBB"' },
  { key: 'pixel', text: '像素坐标原点左上、x 右 y 下；pick/anchor 与 snapshot 输出同域' },
  { key: 'id', text: 'id 由服务端生成：node=n_、material=m_、fx=f_、room=r_ + 8 位小写字母数字；不要自编' },
];

export const conventionMap = (): Record<string, string> =>
  Object.fromEntries(GLOBAL_CONVENTIONS.map((c) => [c.key, c.text]));

export const conventionText = (): string =>
  GLOBAL_CONVENTIONS.map((c) => `${c.key}：${c.text}`).join('\n');
