import type { ReactNode } from 'react';
import type { SideTab } from '../stores/ui';

export type { SideTab };

interface SidePanelProps {
  tab: SideTab;
  onTab(tab: SideTab): void;
  children: ReactNode;
}

const TABS: { id: SideTab; label: string }[] = [
  { id: 'scene', label: '场景' },
  { id: 'inspector', label: '属性' },
];

export function SidePanel({ tab, onTab, children }: SidePanelProps) {
  return (
    <>
      <div role="tablist" className="tabs tabs-border tabs-xs shrink-0 px-2 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">{children}</div>
    </>
  );
}
