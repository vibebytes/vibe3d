import { Icon } from '../common/Icon';

interface EmptyViewportProps {
  onImport(): void;
  onAddBox(): void;
}

export function EmptyViewport({ onImport, onAddBox }: EmptyViewportProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center p-6">
      <div className="empty-card pointer-events-auto">
        <span className="mx-auto grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          <Icon name="model" size={21} />
        </span>
        <h2 className="mt-3 text-[15.5px] font-medium tracking-tight">从模型开始</h2>
        <p className="mx-auto mt-1.5 max-w-72 text-[12px] leading-relaxed text-base-content/55">
          拖入 glTF / GLB 文件，或先放一个基础几何体搭出空间。
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-content transition hover:brightness-110"
            onClick={onImport}
          >
            <Icon name="import" size={14} />
            导入模型
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-base-300 px-3 text-[12px] text-base-content/70 transition hover:border-base-content/25 hover:text-base-content"
            onClick={onAddBox}
          >
            <Icon name="box" size={13} />
            添加立方体
          </button>
        </div>
        <p className="mt-3 text-[11px] text-base-content/55">自动居中 · 缩放至 1.5m · 落到地面</p>
      </div>
    </div>
  );
}
