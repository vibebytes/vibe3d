import { useEffect, useState } from 'react';
import { downloadBase64 } from '../lib/download';
import { rpc } from '../lib/rpc';
import { toSnapshotParams, useRenderSettings } from '../stores/render-settings';
import { RenderSettingsPanel } from './RenderSettingsPanel';

interface SnapshotDialogProps {
  open: boolean;
  roomId: string;
  revision: number;
  onClose(): void;
  onDone(message: string): void;
  onError(message: string): void;
}

export function SnapshotDialog({ open, roomId, revision, onClose, onDone, onError }: SnapshotDialogProps) {
  const settings = useRenderSettings((s) => s.settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  if (!open) return null;

  const shot = async () => {
    setBusy(true);
    try {
      const res = await rpc<{ base64: string; mime: string; width: number; height: number }>(
        'render.snapshot',
        toSnapshotParams(settings),
        roomId,
      );
      downloadBase64(
        res.base64,
        res.mime,
        `${roomId}-r${revision}-${res.width}x${res.height}.${settings.format}`,
      );
      onDone(`快照已生成 ${res.width}×${res.height}`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog open aria-modal="true" className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="text-sm font-medium">离屏快照</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-base-content/40">
          由 daemon 侧渲染器出图，与画布尺寸无关；设置在快照与渲染面板间共用。
        </p>

        <div className="mt-3">
          <RenderSettingsPanel />
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => void shot()}
            disabled={busy}
          >
            {busy && <span className="loading loading-spinner loading-xs" />}
            生成
          </button>
        </div>
      </div>
    </dialog>
  );
}
