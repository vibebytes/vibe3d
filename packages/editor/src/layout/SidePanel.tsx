import type { ReactNode } from 'react';
import { Icon, type IconName } from '../common/Icon';
import type { SideTab } from '../stores/ui';

export type { SideTab };

interface SidePanelProps {
  tab: SideTab;
  onTab(tab: SideTab): void;
  counts?: Partial<Record<SideTab, number>>;
  children: ReactNode;
}

const TABS: { id: SideTab; label: string; icon: IconName }[] = [
  { id: 'scene', label: '场景', icon: 'layers' },
  { id: 'assets', label: '素材', icon: 'assets' },
  { id: 'inspector', label: '属性', icon: 'sliders' },
];

export function SidePanel({ tab, onTab, counts, children }: SidePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="seg mx-2.5 mt-2.5 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-active={tab === t.id ? 'true' : 'false'}
            className="flex-1 justify-center"
            onClick={() => onTab(t.id)}
          >
            <Icon name={t.icon} size={12} />
            <span>{t.label}</span>
            {counts?.[t.id] !== undefined && (
              <span className="num text-[9.5px] text-base-content/55">{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
