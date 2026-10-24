import { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { health } from '../lib/rpc';
import { type ConnStatus, useConn } from '../stores/conn';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { useUi } from '../stores/ui';

const CONN_LABEL: Record<ConnStatus, string> = {
  idle: '未连接',
  connecting: '连接中',
  online: '在线',
  reconnecting: '重连中',
  offline: '离线',
};

function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let start = performance.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - start >= 700) {
        setFps(Math.round((frames * 1000) / (now - start)));
        frames = 0;
        start = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

function useRenderer(): string {
  const [name, setName] = useState('…');
  useEffect(() => {
    let alive = true;
    void health()
      .then((h) => alive && setName(h.renderer))
      .catch(() => alive && setName('—'));
    return () => {
      alive = false;
    };
  }, []);
  return name;
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-base-content/50">{label}</span>
      <span className="num text-base-content/75">{value}</span>
    </span>
  );
}

export function StatusBar({ revision, nodes }: { revision: number; nodes: number }) {
  const fps = useFps();
  const renderer = useRenderer();
  const selected = useSelection((s) => s.primary);
  const selectedCount = useSelection((s) => s.ids.length);
  const preset = useDoc((s) => s.doc?.stage.preset ?? 'clean');
  const importing = useDoc((s) => s.importing);
  const showStats = useUi((s) => s.showStats);
  const conn = useConn((s) => s.status);
  const latency = useConn((s) => s.latency);
  const retries = useConn((s) => s.retries);
  const online = conn === 'online';

  return (
    <footer className="flex h-8 shrink-0 items-center gap-2.5 overflow-hidden border-t border-base-300 bg-base-200/80 px-3.5 text-[11px]">
      <span className="flex items-center gap-1.5 text-base-content/55">
        <Icon name="layers" size={11} />
        <span className="tracking-wide">vibe3d</span>
      </span>
      <span className="divider-v !h-2.5 !mx-0" />
      <Cell label="rev" value={String(revision)} />
      <Cell label="节点" value={String(nodes)} />
      <Cell
        label="选中"
        value={selected ? (selectedCount > 1 ? `${selected} +${selectedCount - 1}` : selected) : '—'}
      />
      <Cell label="配方" value={preset} />
      {importing && (
        <span className="chip chip--live h-[18px]">
          <i className="dot dot--pulse" />
          导入中 {Math.round(importing.ratio * 100)}%
        </span>
      )}
      <span className="ml-auto flex items-center gap-2.5">
        {showStats ? (
          <>
            <Cell label="renderer" value={renderer} />
            <Cell label="fps" value={fps ? String(fps) : '—'} />
          </>
        ) : null}
        {latency !== null ? <Cell label="rtt" value={`${latency}ms`} /> : null}
        {conn === 'reconnecting' ? <Cell label="重试" value={String(retries)} /> : null}
        <span
          className={`chip h-[18px] ${online ? 'chip--live' : conn === 'connecting' || conn === 'reconnecting' ? 'chip--warn' : ''}`}
        >
          <i className={`dot ${online ? '' : 'dot--pulse'}`} />
          {CONN_LABEL[conn]}
        </span>
      </span>
    </footer>
  );
}
