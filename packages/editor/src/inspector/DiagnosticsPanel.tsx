import { ISSUE_LABELS, summarize, useDiagnostics } from '../stores/diagnostics';

export function DiagnosticsPanel() {
  const { issues, groundY, running, error, run, focus, clear } = useDiagnostics();
  const summary = summarize(issues);
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
          体检
        </button>
        {issues.length > 0 && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={clear}>
            清除
          </button>
        )}
        <span className="ml-auto text-base-content/65">
          错误 {summary.errors} · 警告 {summary.warns}
        </span>
      </div>
      {error && <div className="text-error">{error}</div>}
      {groundY !== null && <div className="text-base-content/55">地面 y = {groundY.toFixed(3)}</div>}
      {issues.length === 0 && !running && !error && (
        <div className="text-base-content/45">点「体检」检查悬浮 / 穿模 / 沉地 / 坐标语义。</div>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.nodeIds[0] ?? 'x'}-${i}`}>
            <button
              type="button"
              className="w-full rounded border border-base-300/60 px-2 py-1.5 text-left hover:bg-base-200/60"
              onClick={() => void focus(issue)}
            >
              <span
                className={
                  issue.severity === 'error' ? 'badge badge-error badge-xs' : 'badge badge-warning badge-xs'
                }
              >
                {ISSUE_LABELS[issue.code] ?? issue.code}
              </span>
              <div className="mt-0.5 leading-snug text-base-content/80">{issue.detail}</div>
              <div className="mt-0.5 text-[10px] text-base-content/45">{issue.fixHint}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
