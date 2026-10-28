import { useEffect, useRef } from 'react';
import { useDoc } from '../stores/doc';
import { usePlayback } from '../stores/playback';
import { useSelection } from '../stores/selection';
import { useUi } from '../stores/ui';

interface ShortcutHandlers {
  onDelete(): void;
  onFit(): void;
  onSnapshot(): void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useShortcuts(enabled: boolean, handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const ui = useUi.getState();
      const sel = useSelection.getState();
      const doc = useDoc.getState();
      if (ui.paletteOpen || ui.snapshotOpen || ui.exportOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          void (e.shiftKey ? doc.redo() : doc.undo());
        } else if (key === 'k') {
          e.preventDefault();
          ui.setPalette(true);
        } else if (key === 's') {
          e.preventDefault();
          ref.current.onSnapshot();
        }
        return;
      }
      if (e.key === 'Escape') {
        sel.reset();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!sel.primary) return;
        e.preventDefault();
        ref.current.onDelete();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        usePlayback.getState().toggle();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        usePlayback.getState().step(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        ref.current.onFit();
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        ui.setGrid(!ui.grid);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
