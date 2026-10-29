import { Icon } from '../common/Icon';
import { useUi } from '../stores/ui';

interface ViewportHudProps {
  nodeCount: number;
  cameras?: string[];
  onFit(): void;
  onUseCamera?(name: string): void;
}

export function ViewportHud({ nodeCount, cameras = [], onFit, onUseCamera }: ViewportHudProps) {
  const grid = useUi((s) => s.grid);
  const setGrid = useUi((s) => s.setGrid);
  const letterbox = useUi((s) => s.letterbox);
  const setLetterbox = useUi((s) => s.setLetterbox);
  const gizmoMode = useUi((s) => s.gizmoMode);
  const setGizmoMode = useUi((s) => s.setGizmoMode);

  return (
    <>
      <div className="hud left-3 top-3 flex items-center gap-1.5">
        <div className="hud-card flex items-center gap-0.5 p-1">
          <span className="px-1.5 text-[10.5px] tracking-wide text-base-content/60">透视</span>
          <span className="divider-v !mx-0 !h-3" />
          <button
            type="button"
            className="hud-btn"
            data-active={grid ? 'true' : 'false'}
            onClick={() => setGrid(!grid)}
            title="网格"
            aria-label="网格"
          >
            <Icon name="grid" size={13} />
          </button>
          <button
            type="button"
            className="hud-btn px-1.5 text-[10.5px]"
            data-active={letterbox ? 'true' : 'false'}
            onClick={() => setLetterbox(!letterbox)}
            title="16:9 遮幅"
            aria-label="16:9"
          >
            16:9
          </button>
          <span className="num px-1 text-[10.5px] text-base-content/60">{nodeCount} 节点</span>
        </div>
        {cameras.length > 0 && onUseCamera && (
          <div className="hud-card flex items-center gap-0.5 p-1">
            {cameras.slice(0, 4).map((name) => (
              <button
                key={name}
                type="button"
                className="hud-btn px-1.5 text-[10.5px]"
                onClick={() => onUseCamera(name)}
                title={`切换到已存机位 ${name}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hud right-3 top-3">
        <div className="hud-card flex items-center gap-0.5 p-1">
          <button
            type="button"
            className="hud-btn"
            data-active={gizmoMode === 'translate' ? 'true' : 'false'}
            onClick={() => setGizmoMode('translate')}
            title="移动 W"
            aria-label="移动"
          >
            <Icon name="move" size={13} />
          </button>
          <button
            type="button"
            className="hud-btn"
            data-active={gizmoMode === 'rotate' ? 'true' : 'false'}
            onClick={() => setGizmoMode('rotate')}
            title="旋转 E"
            aria-label="旋转"
          >
            <Icon name="rotate" size={13} />
          </button>
          <button
            type="button"
            className="hud-btn"
            data-active={gizmoMode === 'scale' ? 'true' : 'false'}
            onClick={() => setGizmoMode('scale')}
            title="缩放 R"
            aria-label="缩放"
          >
            <Icon name="scale" size={13} />
          </button>
          <span className="divider-v !mx-0 !h-3" />
          <button type="button" className="hud-btn" onClick={onFit} title="适配视图 F">
            <Icon name="fit" size={13} />
            <span className="hidden sm:inline">适配</span>
          </button>
        </div>
      </div>

      <div className="hud bottom-3 left-3 hidden md:flex">
        <div className="hud-card px-2 py-1 text-[10.5px] text-base-content/55">
          左键选择 · 拖拽手柄变换 · <span className="kbd">⌘K</span> 命令
        </div>
      </div>
    </>
  );
}
