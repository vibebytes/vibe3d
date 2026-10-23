import { useEffect, useState } from 'react';
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
    <span className="flex items-baseline gap-1">
      <span className="text-base-content/30">{label}</span>
      <span className="num text-base-content/60">{value}</span>
    </span>
  );
}

export function StatusBar({ revision, nodes }: { revision: number; nodes: number }) {
  const fps = useFps();
  const renderer = useRenderer();
  const selected = useSelection((s) => s.primary);
  const selectedCount = useSelection((s) => s.ids.length);
  const preset = useDoc((s) => s.doc?.stage.preset ?? 'clean');
  const showStats = useUi((s) => s.showStats);
  const conn = useConn((s) => s.status);
  const latency = useConn((s) => s.latency);
  const retries = useConn((s) => s.retries);
  const online = conn === 'online';

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-base-300 bg-base-200 px-3 text-[10px]">
      <Cell label="rev" value={String(revision)} />
      <Cell label="节点" value={String(nodes)} />
      <Cell
        label="选中"
        value={selected ? (selectedCount > 1 ? `${selected} +${selectedCount - 1}` : selected) : '—'}
      />
      <Cell label="配方" value={preset} />
      <span className="ml-auto flex items-center gap-3">
        {showStats ? (
          <>
            <Cell label="渲染器" value={renderer} />
            <Cell label="fps" value={fps ? String(fps) : '—'} />
          </>
        ) : null}
        {latency !== null ? <Cell label="rtt" value={`${latency}ms`} /> : null}
        {conn === 'reconnecting' ? <Cell label="重试" value={String(retries)} /> : null}
        <Cell label="链路" value={CONN_LABEL[conn]} />
        <span
          className={`inline-block size-1.5 rounded-full ${online ? 'bg-success' : conn === 'connecting' || conn === 'reconnecting' ? 'bg-warning' : 'bg-base-content/20'}`}
          title={`WS ${CONN_LABEL[conn]}`}
        />
      </span>
    </div>
  );
}
