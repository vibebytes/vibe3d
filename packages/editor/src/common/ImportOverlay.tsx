import type { ImportProgress } from '../stores/doc';
import { Icon } from './Icon';

interface ImportOverlayProps {
  dragging: boolean;
  importing: ImportProgress | null;
}

export function ImportOverlay({ dragging, importing }: ImportOverlayProps) {
  if (dragging)
    return (
      <div className="drop-overlay" aria-hidden="true">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Icon name="import" size={26} />
          </span>
          <div>
            <p className="text-base font-medium">松开以导入模型</p>
            <p className="mt-1 text-xs text-base-content/45">支持 .glb / .gltf，可一次拖入多个文件</p>
          </div>
        </div>
      </div>
    );

  if (!importing) return null;
  const pct = Math.round(importing.ratio * 100);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 w-72 -translate-x-1/2">
      <div className="import-card">
        <div className="flex items-center gap-2">
          <span className="text-primary">
            <Icon name="import" size={14} />
          </span>
          <p className="min-w-0 flex-1 truncate text-[12px] text-base-content/85">{importing.name}</p>
          <span className="num text-[10px] text-base-content/40">
            {importing.index}/{importing.total}
          </span>
        </div>
        <div className="progress-track mt-2.5">
          <div className="progress-bar" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-base-content/35">
          <span>上传并解析</span>
          <span className="num">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
