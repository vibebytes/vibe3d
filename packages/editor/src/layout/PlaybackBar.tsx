import { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { frameOf, usePlayback } from '../stores/playback';

function NumField({
  label,
  value,
  min,
  max,
  width = 'w-12',
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  width?: string;
  onCommit(next: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      className={`num h-6 ${width} shrink-0 rounded border border-base-300 bg-base-100/60 px-1.5 text-right text-[11px] outline-none focus:border-primary`}
      value={text}
      min={min}
      max={max}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function PlaybackBar() {
  const playing = usePlayback((s) => s.playing);
  const loop = usePlayback((s) => s.loop);
  const start = usePlayback((s) => s.start);
  const end = usePlayback((s) => s.end);
  const fps = usePlayback((s) => s.fps);
  const frame = usePlayback((s) => frameOf(s, s.time));
  const seconds = Math.max(0, (frame - start) / fps);

  return (
    <footer className="flex h-9 shrink-0 items-center gap-1.5 overflow-hidden border-t border-base-300 bg-base-200/80 px-2.5 text-[11px]">
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className="icon-btn"
          title="回到起始帧"
          aria-label="回到起始帧"
          onClick={() => usePlayback.getState().goToStart()}
        >
          <Icon name="skipStart" size={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="上一帧"
          aria-label="上一帧"
          onClick={() => usePlayback.getState().step(-1)}
        >
          <Icon name="stepBack" size={13} />
        </button>
        <button
          type="button"
          className={`icon-btn ${playing ? 'icon-btn--solid' : ''}`}
          data-active={playing}
          title={playing ? '暂停（空格）' : '播放（空格）'}
          aria-label={playing ? '暂停' : '播放'}
          aria-pressed={playing}
          onClick={() => usePlayback.getState().toggle()}
        >
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="下一帧"
          aria-label="下一帧"
          onClick={() => usePlayback.getState().step(1)}
        >
          <Icon name="stepForward" size={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="跳到结束帧"
          aria-label="跳到结束帧"
          onClick={() => usePlayback.getState().goToEnd()}
        >
          <Icon name="skipEnd" size={13} />
        </button>
      </div>

      <span className="divider-v !mx-0.5 !h-3" />

      <span className="shrink-0 text-base-content/45">帧</span>
      <NumField label="当前帧" value={frame} min={start} max={end} onCommit={(n) => usePlayback.getState().seekFrame(n)} />
      <span className="shrink-0 text-base-content/35">/</span>
      <NumField
        label="结束帧"
        value={end}
        min={1}
        width="w-12"
        onCommit={(n) => usePlayback.getState().setRange(start, Math.max(start + 1, Math.round(n)))}
      />

      <span className="ml-1 shrink-0 text-base-content/45">fps</span>
      <NumField
        label="帧率"
        value={fps}
        min={1}
        max={120}
        width="w-10"
        onCommit={(n) => usePlayback.getState().setFps(n)}
      />

      <button
        type="button"
        className="icon-btn"
        data-active={loop}
        title={loop ? '循环播放：开' : '循环播放：关'}
        aria-label="循环播放"
        aria-pressed={loop}
        onClick={() => usePlayback.getState().setLoop(!loop)}
      >
        <Icon name="loop" size={13} />
      </button>

      <input
        type="range"
        aria-label="播放头"
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
        min={Math.min(start, end)}
        max={Math.max(start, end)}
        step={1}
        value={frame}
        onChange={(e) => usePlayback.getState().seekFrame(Number(e.target.value))}
      />

      <span className="num shrink-0 tabular-nums text-base-content/55">{seconds.toFixed(2)}s</span>
    </footer>
  );
}
