import type { ReactNode } from 'react';

interface AppShellProps {
  topBar: ReactNode;
  sidePanel: ReactNode;
  inspector?: ReactNode;
  statusBar: ReactNode;
  bottomBar?: ReactNode;
  banner?: ReactNode;
  panelOpen: boolean;
  onPanelOpenChange(open: boolean): void;
  children: ReactNode;
}

export function AppShell({
  topBar,
  sidePanel,
  inspector,
  statusBar,
  bottomBar,
  banner,
  panelOpen,
  onPanelOpenChange,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-base-100 text-base-content">
      {topBar}
      {banner}
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={`w-[15.5rem] shrink-0 flex-col border-r border-base-300 bg-base-200/70 ${
            panelOpen ? 'absolute inset-y-0 left-0 z-30 flex shadow-2xl shadow-black/50' : 'hidden'
          } lg:static lg:z-auto lg:flex lg:shadow-none`}
        >
          {sidePanel}
        </aside>
        {panelOpen && (
          <button
            type="button"
            aria-label="关闭面板"
            className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => onPanelOpenChange(false)}
          />
        )}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#07090c]">{children}</main>
        {inspector && (
          <aside className="scroll-thin hidden w-[19rem] shrink-0 overflow-auto border-l border-base-300 bg-base-200/70 xl:block">
            {inspector}
          </aside>
        )}
      </div>
      {bottomBar}
      {statusBar}
    </div>
  );
}
