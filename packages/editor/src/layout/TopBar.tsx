import { Link } from 'react-router-dom';

type Preset = 'cine' | 'clean' | 'flat';
type AddKind = 'box' | 'sphere' | 'cylinder' | 'light';

interface TopBarProps {
  roomId: string;
  name: string;
  revision: number;
  online: boolean;
  preset: Preset;
  onAdd(kind: AddKind): void;
  onPreset(preset: Preset): void;
  onUndo(): void;
  onRedo(): void;
  onSnapshot(): void;
  onExport(): void;
  onCommand(): void;
  onTogglePanel(): void;
}

const SHAPES: AddKind[] = ['box', 'sphere', 'cylinder', 'light'];

export function TopBar(p: TopBarProps) {
  return (
    <header className="navbar min-h-0 gap-3 border-b border-base-300 bg-base-200 px-3 py-2">
      <button
        type="button"
        className="btn btn-ghost btn-xs lg:hidden"
        aria-label="场景面板"
        onClick={p.onTogglePanel}
      >
        ☰
      </button>
      <Link to="/" className="btn btn-ghost btn-xs text-base-content/50">
        ← 房间
      </Link>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{p.name}</span>
        <span className="num text-[10px] text-base-content/35">
          {p.roomId} · r{p.revision}
        </span>
      </div>
      <span
        className={`badge badge-xs ${p.online ? 'badge-success' : 'badge-ghost'}`}
        title={p.online ? 'WebSocket 已连接' : 'WebSocket 未连接'}
      >
        {p.online ? 'live' : 'offline'}
      </span>

      <div className="join ml-2">
        {SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            className="btn join-item btn-ghost btn-xs"
            onClick={() => p.onAdd(shape)}
          >
            + {shape}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <select
          className="select select-xs w-24"
          value={p.preset}
          onChange={(e) => p.onPreset(e.target.value as Preset)}
          aria-label="呈现配方"
        >
          <option value="clean">clean</option>
          <option value="cine">cine</option>
          <option value="flat">flat</option>
        </select>
        <div className="join">
          <button type="button" className="btn join-item btn-ghost btn-xs" onClick={p.onUndo} title="⌘Z">
            撤销
          </button>
          <button type="button" className="btn join-item btn-ghost btn-xs" onClick={p.onRedo} title="⇧⌘Z">
            重做
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={p.onCommand} title="⌘K">
          命令
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={p.onSnapshot}>
          快照
        </button>
        <button type="button" className="btn btn-primary btn-xs" onClick={p.onExport}>
          导出 GLB
        </button>
      </div>
    </header>
  );
}
