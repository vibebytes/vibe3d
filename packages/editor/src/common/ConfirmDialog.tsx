import { type ReactNode, useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <dialog open aria-modal="true" className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <div className="mt-2 text-xs leading-relaxed text-base-content/60">{description}</div>
        )}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn btn-xs ${danger ? 'btn-error' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="loading loading-spinner loading-xs" />}
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
