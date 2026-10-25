import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../common/Icon';

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
  onImport(): void;
  onCommand(): void;
  onTogglePanel(): void;
}

const SHAPES: { kind: AddKind; icon: IconName }[] = [
  { kind: 'box', icon: 'box' },
  { kind: 'sphere', icon: 'sphere' },
  { kind: 'cylinder', icon: 'cylinder' },
  { kind: 'light', icon: 'sun' },
];

export function TopBar(p: TopBarProps) {
  return (
    <header className="@container topbar">
      <button type="button" className="icon-btn @5xl:hidden" aria-label="场景面板" onClick={p.onTogglePanel}>
        <Icon name="panel" size={15} />
      </button>

      <Link to="/" className="brand-mark shrink-0" aria-label="返回房间列表">
        V3
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="max-w-52 truncate text-[13px] font-semibold tracking-tight">{p.name}</span>
          <span className={`chip ${p.online ? 'chip--live' : ''}`}>
            <i className={`dot ${p.online ? 'dot--pulse' : ''}`} />
            {p.online ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <div className="num mt-0.5 hidden items-center gap-1.5 text-[10.5px] text-base-content/55 @2xl:flex">
          <span className="max-w-36 truncate">{p.roomId}</span>
          <span className="text-base-content/25">·</span>
          <span className="text-base-content/45">rev</span>
          <span>{p.revision}</span>
        </div>
      </div>

      <div className="divider-v mx-2 hidden @5xl:block" />

      <div className="seg hidden @5xl:flex" aria-label="添加几何体">
        {SHAPES.map((s) => (
          <button key={s.kind} type="button" onClick={() => p.onAdd(s.kind)} aria-label={s.kind}>
            <Icon name={s.icon} size={13} />
            <span className="hidden @6xl:inline">{s.kind}</span>
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div className="seg hidden @3xl:flex" aria-label="呈现配方">
          {(['clean', 'cine', 'flat'] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-active={p.preset === v ? 'true' : 'false'}
              onClick={() => p.onPreset(v)}
              title={`呈现配方 ${v}`}
            >
              <span className="text-[11px] tracking-wide">{v}</span>
            </button>
          ))}
        </div>

        <span className="divider-v hidden @3xl:block" />

        <div className="join shrink-0">
          <button
            type="button"
            className="icon-btn join-item"
            onClick={p.onUndo}
            title="撤销 ⌘Z"
            aria-label="撤销"
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn join-item"
            onClick={p.onRedo}
            title="重做 ⇧⌘Z"
            aria-label="重做"
          >
            <Icon name="redo" size={14} />
          </button>
        </div>

        <button
          type="button"
          className="icon-btn hidden @2xl:inline-flex"
          onClick={p.onCommand}
          title="命令面板 ⌘K"
          aria-label="命令"
        >
          <Icon name="command" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn hidden @xl:inline-flex"
          onClick={p.onSnapshot}
          title="生成快照"
          aria-label="快照"
        >
          <Icon name="camera" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn hidden @3xl:inline-flex"
          onClick={p.onExport}
          title="导出 GLB"
          aria-label="导出 GLB"
        >
          <Icon name="export" size={14} />
          <span className="hidden text-[11px] @5xl:inline">GLB</span>
        </button>

        <div className="divider-v mx-1" />

        <button
          type="button"
          className="ml-1 inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-content transition hover:brightness-110"
          onClick={p.onImport}
        >
          <Icon name="import" size={14} />
          <span className="hidden @xs:inline">导入</span>
        </button>
      </div>
    </header>
  );
}
