import { create } from 'zustand';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type SideTab = 'scene' | 'assets' | 'inspector' | 'timeline';
export type ViewMode = 'perspective' | 'front' | 'right' | 'top';

interface Persistent {
  gizmoMode: GizmoMode;
  panel: SideTab;
  panelOpen: boolean;
  grid: boolean;
  letterbox: boolean;
  showStats: boolean;
  viewMode: ViewMode;
}

interface UiStore extends Persistent {
  paletteOpen: boolean;
  snapshotOpen: boolean;
  exportOpen: boolean;
  setGizmoMode(mode: GizmoMode): void;
  setPanel(tab: SideTab): void;
  setPanelOpen(open: boolean): void;
  togglePanel(): void;
  setGrid(on: boolean): void;
  setLetterbox(on: boolean): void;
  toggleStats(): void;
  setViewMode(mode: ViewMode): void;
  setPalette(open: boolean): void;
  setSnapshot(open: boolean): void;
  setExport(open: boolean): void;
}

const KEY = 'vibe3d.ui';

const defaults: Persistent = {
  gizmoMode: 'translate',
  panel: 'scene',
  panelOpen: false,
  grid: true,
  letterbox: true,
  showStats: true,
  viewMode: 'perspective',
};

function load(): Persistent {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Persistent>) } : defaults;
  } catch {
    return defaults;
  }
}

export const useUi = create<UiStore>((set, get) => ({
  ...load(),
  paletteOpen: false,
  snapshotOpen: false,
  exportOpen: false,

  setGizmoMode(mode) {
    set({ gizmoMode: mode });
  },
  setPanel(panel) {
    set({ panel });
  },
  setPanelOpen(panelOpen) {
    set({ panelOpen });
  },
  togglePanel() {
    set({ panelOpen: !get().panelOpen });
  },
  setGrid(grid) {
    set({ grid });
  },
  setLetterbox(letterbox) {
    set({ letterbox });
  },
  toggleStats() {
    set({ showStats: !get().showStats });
  },
  setViewMode(viewMode) {
    set({ viewMode });
  },
  setPalette(paletteOpen) {
    set({ paletteOpen });
  },
  setSnapshot(snapshotOpen) {
    set({ snapshotOpen });
  },
  setExport(exportOpen) {
    set({ exportOpen });
  },
}));

useUi.subscribe((s) => {
  const persisted: Persistent = {
    gizmoMode: s.gizmoMode,
    panel: s.panel,
    panelOpen: s.panelOpen,
    grid: s.grid,
    letterbox: s.letterbox,
    showStats: s.showStats,
    viewMode: s.viewMode,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    // storage full or blocked: UI prefs are best-effort
  }
});
