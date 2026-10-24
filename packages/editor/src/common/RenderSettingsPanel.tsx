import {
  IMAGE_FORMATS,
  OVERLAY_KINDS,
  QUALITY_LEVELS,
  SHADING_MODES,
  useRenderSettings,
} from '../stores/render-settings';

const SIZES = [
  { label: '640×360', w: 640, h: 360 },
  { label: '1280×720', w: 1280, h: 720 },
  { label: '1920×1080', w: 1920, h: 1080 },
];

const SETTLE = [0, 150, 500, 1000];

const SHADING_LABEL: Record<string, string> = {
  flat: '平光',
  wireframe: '线框',
  normals: '法线',
  material: '材质',
  rendered: '渲染（阴影/AO）',
};

const OVERLAY_LABEL: Record<string, string> = {
  grid: '网格',
  axes: '坐标轴',
  bbox: '包围盒',
  ground: '地面',
  centerline: '中心线',
  scale: '比例尺',
  normal: '法线',
  dims: '尺寸',
};

const QUALITY_LABEL: Record<string, string> = { draft: '草稿', standard: '标准', high: '高' };

export function RenderSettingsPanel() {
  const s = useRenderSettings((st) => st.settings);
  const set = useRenderSettings((st) => st.set);

  const toggleOverlay = (kind: string) => {
    const next = s.overlay.includes(kind as never)
      ? s.overlay.filter((k) => k !== kind)
      : [...s.overlay, kind as never];
    set({ overlay: next });
  };

  return (
    <div className="grid gap-3">
      <fieldset className="form-control">
        <legend className="mb-1 text-[11px] text-base-content/50">分辨率</legend>
        <div className="join">
          {SIZES.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`btn join-item btn-xs ${s.width === p.w && s.height === p.h ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => set({ width: p.w, height: p.h })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <label className="form-control flex-1">
            <span className="mb-1 text-[11px] text-base-content/50">宽</span>
            <input
              type="number"
              min={64}
              max={4096}
              className="input input-xs num"
              value={s.width}
              onChange={(e) => set({ width: Number(e.target.value) })}
            />
          </label>
          <label className="form-control flex-1">
            <span className="mb-1 text-[11px] text-base-content/50">高</span>
            <input
              type="number"
              min={64}
              max={4096}
              className="input input-xs num"
              value={s.height}
              onChange={(e) => set({ height: Number(e.target.value) })}
            />
          </label>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <label className="form-control flex-1">
          <span className="mb-1 text-[11px] text-base-content/50">格式</span>
          <select
            className="select select-xs"
            value={s.format}
            onChange={(e) => set({ format: e.target.value as never })}
          >
            {IMAGE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control flex-1">
          <span className="mb-1 text-[11px] text-base-content/50">质量档</span>
          <select
            className="select select-xs"
            value={s.quality}
            onChange={(e) => set({ quality: e.target.value as never })}
          >
            {QUALITY_LEVELS.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABEL[q]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control flex-1">
          <span className="mb-1 text-[11px] text-base-content/50">等待稳定</span>
          <select
            className="select select-xs"
            value={s.settleMs}
            onChange={(e) => set({ settleMs: Number(e.target.value) })}
          >
            {SETTLE.map((ms) => (
              <option key={ms} value={ms}>
                {ms === 0 ? '不等待' : `${ms} ms`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="form-control">
        <span className="mb-1 text-[11px] text-base-content/50">着色</span>
        <select
          className="select select-xs"
          value={s.shading}
          onChange={(e) => set({ shading: e.target.value as never })}
        >
          {SHADING_MODES.map((m) => (
            <option key={m} value={m}>
              {SHADING_LABEL[m]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="form-control">
        <legend className="mb-1 text-[11px] text-base-content/50">叠层（可多选）</legend>
        <div className="flex flex-wrap gap-1">
          {OVERLAY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`btn btn-xs ${s.overlay.includes(k) ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => toggleOverlay(k)}
            >
              {OVERLAY_LABEL[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="label cursor-pointer justify-start gap-2">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={s.transparent}
          onChange={(e) => set({ transparent: e.target.checked })}
        />
        <span className="text-[11px] text-base-content/50">透明背景（仅 png）</span>
      </label>
    </div>
  );
}
