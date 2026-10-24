import { useEffect } from 'react';
import { useTimeline } from '../stores/timeline';

export function TimelinePanel() {
  const { entries, revision, running, error, run, undoTo } = useTimeline();

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="flex h-full flex-col gap-2 text-[11px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-xs"
          onClick={() => void run()}
          disabled={running}
        >
          {running && <span className="loading loading-spinner loading-xs" />}
          刷新
        </button>
        <span className="ml-auto text-base-content/55">
          rev {revision ?? '—'} · 最近 {entries.length} 步
        </span>
      </div>
      {error && <div className="text-error">{error}</div>}
      {entries.length === 0 && !running && !error && (
        <div className="text-base-content/45">
          还没有可回放的批次；每次 ops.apply（带 opId）都会记入时间线。
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {entries.map((e) => (
          <li key={e.revision}>
            <div className="rounded border border-base-300/60 px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="badge badge-ghost badge-xs">r{e.revision}</span>
                <span className="truncate leading-snug text-base-content/80">{e.summary}</span>
                {e.author && (
                  <span className="ml-auto shrink-0 text-[10px] text-base-content/45">{e.author}</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-base-content/45">
                  {e.ops} 个 op{e.opId ? ` · ${e.opId}` : ''}
                </span>
                {e.opId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs ml-auto"
                    onClick={() => void undoTo(e.opId as string)}
                  >
                    回退到此步
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
