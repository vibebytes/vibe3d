import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const META: Record<ToastKind, { icon: IconName; tone: string }> = {
  info: { icon: 'info', tone: 'text-info' },
  success: { icon: 'check', tone: 'text-primary' },
  warning: { icon: 'alert', tone: 'text-warning' },
  error: { icon: 'alert', tone: 'text-error' },
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
    <div className="pointer-events-none fixed right-3 bottom-9 z-50 flex w-80 flex-col items-end gap-2">
      {items.map((t) => {
        const meta = META[t.kind];
        return (
          <div key={t.id} className="toast-card pointer-events-auto w-full">
            <span className={`mt-0.5 shrink-0 ${meta.tone}`}>
              <Icon name={meta.icon} size={14} />
            </span>
            <p className="min-w-0 flex-1 leading-relaxed text-base-content/80">{t.message}</p>
            <button
              type="button"
              className="icon-btn -mr-1 -mt-1 size-6 min-w-0 shrink-0"
              aria-label="关闭提示"
              onClick={() => onDismiss(t.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
