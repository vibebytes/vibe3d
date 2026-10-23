import { useEffect, useState } from 'react';
import { daemonUrl, rpc } from '../lib/rpc';

interface ExportDialogProps {
  open: boolean;
  roomId: string;
  revision: number;
  selectedIds: string[];
  onClose(): void;
  onDone(message: string): void;
  onError(message: string): void;
}

type Scope = 'scene' | 'selection';

interface ExportResult {
  jobId: string;
  url: string;
  bytes: number;
  revision: number;
}

export function ExportDialog({
  open,
  roomId,
  revision,
  selectedIds,
  onClose,
  onDone,
  onError,
}: ExportDialogProps) {
  const [scope, setScope] = useState<Scope>('scene');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setResult(null);
      setScope('scene');
    }
  }, [open]);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    try {
      const res = await rpc<ExportResult>(
        'export.glb',
        scope === 'selection' ? { nodeIds: selectedIds } : {},
        roomId,
      );
      setResult(res);
      onDone(`导出完成 ${(res.bytes / 1024).toFixed(1)} KB`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog open aria-modal="true" className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="text-sm font-medium">导出 GLB</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-base-content/40">
          服务端导出并签名下载地址，10 分钟内有效。
        </p>

        <div className="mt-3 flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              className="radio radio-xs"
              checked={scope === 'scene'}
              onChange={() => setScope('scene')}
            />
            全场景
          </label>
          <label
            className={`flex items-center gap-2 text-xs ${selectedIds.length === 0 ? 'opacity-40' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              className="radio radio-xs"
              checked={scope === 'selection'}
              disabled={selectedIds.length === 0}
              onChange={() => setScope('selection')}
            />
            选中节点（{selectedIds.length}）
          </label>
        </div>

        {result && (
          <div className="mt-3 rounded-box border border-base-300 bg-base-200/60 p-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-base-content/50">job {result.jobId}</span>
              <span className="num text-base-content/60">
                {(result.bytes / 1024).toFixed(1)} KB · r{result.revision}
              </span>
            </div>
            <a
              className="btn btn-primary btn-xs mt-2 w-full"
              href={daemonUrl(result.url)}
              target="_blank"
              rel="noreferrer"
            >
              下载 GLB
            </a>
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} disabled={busy}>
            {result ? '关闭' : '取消'}
          </button>
          <button type="button" className="btn btn-primary btn-xs" onClick={() => void run()} disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            导出
          </button>
        </div>
      </div>
    </dialog>
  );
}
