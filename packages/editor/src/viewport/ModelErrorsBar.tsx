import { useDoc } from '../stores/doc';
import { useModelErrors } from '../stores/modelErrors';

export function ModelErrorsBar() {
  const errors = useModelErrors((s) => s.errors);
  const retry = useModelErrors((s) => s.retry);
  const assets = useDoc((s) => s.doc?.assets);
  const entries = Object.values(errors);
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-auto fixed bottom-3 left-3 z-50 w-80 rounded-box bg-base-300/90 p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-warning">模型资源加载失败，服务可能已重启</span>
        <button
          type="button"
          className="btn btn-xs btn-primary"
          onClick={() => {
            for (const e of entries) retry(e.nodeId);
          }}
        >
          重试
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => (
          <li key={e.nodeId} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-base-content/70" title={e.message}>
              {assets?.[e.sha]?.name ?? e.sha.slice(0, 8)}
            </span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => retry(e.nodeId)}>
              重试
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
