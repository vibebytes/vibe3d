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

interface JobView {
  jobId: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  pct: number;
  phase?: string;
  url?: string;
  bytes?: number;
  revision?: number;
  error?: { code: string; message: string };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  const [job, setJob] = useState<JobView | null>(null);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setJob(null);
      setScope('scene');
    }
  }, [open]);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    setJob(null);
    try {
      const started = await rpc<{ jobId: string }>(
        'export.glb',
        scope === 'selection' ? { nodeIds: selectedIds } : {},
        roomId,
      );
      for (let i = 0; i < 600; i++) {
        const view = await rpc<JobView>('job.get', { jobId: started.jobId });
        setJob(view);
        if (view.state === 'done') {
          onDone(`导出完成 ${((view.bytes ?? 0) / 1024).toFixed(1)} KB`);
          return;
        }
        if (view.state === 'failed') throw new Error(view.error?.message ?? '导出失败');
        if (view.state === 'cancelled') throw new Error('导出已取消');
        await sleep(500);
      }
      throw new Error('导出超时');
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pct = Math.round((job?.pct ?? 0) * 100);

  return (
    <dialog open aria-modal="true" className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="text-sm font-medium">导出 GLB</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-base-content/40">
          后台任务导出，完成后生成签名下载地址，10 分钟内有效。
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

        {job && (
          <div className="mt-3 rounded-box border border-base-300 bg-base-200/60 p-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-base-content/50">job {job.jobId}</span>
              <span className="num text-base-content/60">
                {job.state === 'done'
                  ? `${((job.bytes ?? 0) / 1024).toFixed(1)} KB · r${job.revision ?? revision}`
                  : `${job.phase ?? job.state} ${pct}%`}
              </span>
            </div>
            {job.state === 'done' && job.url && (
              <a
                className="btn btn-primary btn-xs mt-2 w-full"
                href={daemonUrl(job.url)}
                target="_blank"
                rel="noreferrer"
              >
                下载 GLB
              </a>
            )}
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} disabled={busy}>
            {job?.state === 'done' ? '关闭' : '取消'}
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
