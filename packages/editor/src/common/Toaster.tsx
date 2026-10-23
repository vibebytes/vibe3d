import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ALERT: Record<ToastKind, string> = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-error',
};

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-3), { id, kind, message }]);
    const timer = window.setTimeout(
      () => setItems((list) => list.filter((t) => t.id !== id)),
      kind === 'error' ? 6000 : 3500,
    );
    timers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  return { items, push, dismiss };
}

export function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss(id: number): void }) {
  if (items.length === 0) return null;
  return (
    <div className="toast toast-end toast-bottom z-50">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`alert ${ALERT[t.kind]} max-w-80 py-2 text-xs`}
          onClick={() => onDismiss(t.id)}
        >
          <span className="text-left leading-relaxed">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
