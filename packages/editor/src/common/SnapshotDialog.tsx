import { useEffect, useState } from 'react';
import { downloadBase64 } from '../lib/download';
import { rpc } from '../lib/rpc';

interface SnapshotDialogProps {
  open: boolean;
  roomId: string;
  revision: number;
  onClose(): void;
  onDone(message: string): void;
  onError(message: string): void;
}

const SIZES = [
  { label: '1280×720', w: 1280, h: 720 },
  { label: '1920×1080', w: 1920, h: 1080 },
  { label: '640×360', w: 640, h: 360 },
];

const SETTLE = [0, 150, 500];

export function SnapshotDialog({ open, roomId, revision, onClose, onDone, onError }: SnapshotDialogProps) {
  const [w, setW] = useState(1280);
  const [h, setH] = useState(720);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [settle, setSettle] = useState(150);
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
        { width: w, height: h, format, settleMs: settle },
        roomId,
      );
      downloadBase64(res.base64, res.mime, `${roomId}-r${revision}-${res.width}x${res.height}.${format}`);
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
          由 daemon 侧渲染器出图，与画布尺寸无关。
        </p>

        <div className="mt-3 grid gap-3">
          <fieldset className="form-control">
            <legend className="mb-1 text-[11px] text-base-content/50">分辨率</legend>
            <div className="join">
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`btn join-item btn-xs ${w === s.w && h === s.h ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setW(s.w);
                    setH(s.h);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2">
            <label className="form-control flex-1">
              <span className="mb-1 text-[11px] text-base-content/50">宽</span>
              <input
                type="number"
                min={64}
                max={4096}
                className="input input-xs num"
                value={w}
                onChange={(e) => setW(Number(e.target.value))}
              />
            </label>
            <label className="form-control flex-1">
              <span className="mb-1 text-[11px] text-base-content/50">高</span>
              <input
                type="number"
                min={64}
                max={4096}
                className="input input-xs num"
                value={h}
                onChange={(e) => setH(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="form-control">
            <span className="mb-1 text-[11px] text-base-content/50">格式</span>
            <select
              className="select select-xs"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}
            >
              <option value="png">png</option>
              <option value="jpeg">jpeg</option>
            </select>
          </label>

          <label className="form-control">
            <span className="mb-1 text-[11px] text-base-content/50">等待动画稳定</span>
            <select
              className="select select-xs"
              value={settle}
              onChange={(e) => setSettle(Number(e.target.value))}
            >
              {SETTLE.map((ms) => (
                <option key={ms} value={ms}>
                  {ms === 0 ? '不等待' : `${ms} ms`}
                </option>
              ))}
            </select>
          </label>
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
