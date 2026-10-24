import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CommandPalette } from '../common/CommandPalette';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ExportDialog } from '../common/ExportDialog';
import { ImportOverlay } from '../common/ImportOverlay';
import { SnapshotDialog } from '../common/SnapshotDialog';
import { Toaster, useToasts } from '../common/Toaster';
import { Inspector } from '../inspector/Inspector';
import { AppShell } from '../layout/AppShell';
import { SidePanel } from '../layout/SidePanel';
import { StatusBar } from '../layout/StatusBar';
import { TopBar } from '../layout/TopBar';
import { AssetsPanel } from '../scene/AssetsPanel';
import { SceneTree } from '../scene/SceneTree';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { useUi } from '../stores/ui';
import { CaptureBridge } from '../viewport/CaptureBridge';
import { EmptyViewport } from '../viewport/EmptyViewport';
import { SceneCanvas } from '../viewport/SceneCanvas';
import { ViewportHud } from '../viewport/ViewportHud';
import { HeadlessPage } from './HeadlessPage';
import { editorCommands } from './useEditorCommands';
import { useModelImport } from './useModelImport';
import { useShortcuts } from './useShortcuts';

export function EditorPage() {
  const { roomId = '' } = useParams();
  const [params] = useSearchParams();
  const headless = params.get('headless') === '1';

  const doc = useDoc((s) => s.doc);
  const status = useDoc((s) => s.status);
  const error = useDoc((s) => s.error);
  const online = useDoc((s) => s.online);
  const load = useDoc((s) => s.load);
  const dispose = useDoc((s) => s.dispose);

  const selected = useSelection((s) => s.primary);
  const selectedIds = useSelection((s) => s.ids);

  const tab = useUi((s) => s.panel);
  const panelOpen = useUi((s) => s.panelOpen);
  const paletteOpen = useUi((s) => s.paletteOpen);
  const snapshotOpen = useUi((s) => s.snapshotOpen);
  const exportOpen = useUi((s) => s.exportOpen);
  const setTab = useUi((s) => s.setPanel);
  const setPanelOpen = useUi((s) => s.setPanelOpen);
  const togglePanel = useUi((s) => s.togglePanel);
  const setPaletteOpen = useUi((s) => s.setPalette);
  const setSnapshotOpen = useUi((s) => s.setSnapshot);
  const setExportOpen = useUi((s) => s.setExport);

  const { items, push, dismiss } = useToasts();
  const importer = useModelImport(push);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (roomId) void load(roomId);
    return () => {
      dispose();
      useSelection.getState().reset();
    };
  }, [roomId, load, dispose]);

  const nodes = useMemo(
    () => (doc ? Object.values(doc.nodes).map((n) => ({ id: n.id, name: n.name })) : []),
    [doc],
  );
  const modelCount = useMemo(
    () => (doc ? Object.values(doc.nodes).filter((n) => n.kind === 'model').length : 0),
    [doc],
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      push('error', err instanceof Error ? err.message : String(err));
    }
  };

  const deleteSelected = () => {
    if (!selected) return;
    setConfirm({ id: selected, name: doc?.nodes[selected]?.name ?? selected });
  };

  useShortcuts(!headless, {
    onDelete: deleteSelected,
    onFit: () => void run(() => useDoc.getState().frameCamera('fit')),
    onSnapshot: () => setSnapshotOpen(true),
  });

  if (headless) return <HeadlessPage />;
  if (status === 'loading' && !doc)
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-base-content/45">
        <span className="dot dot--pulse text-primary" />
        载入房间…
      </div>
    );
  if (error && !doc)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="empty-card text-left">
          <h1 className="text-sm font-medium">无法载入房间</h1>
          <p className="mt-2 text-xs leading-relaxed text-base-content/45">{error}</p>
        </div>
      </div>
    );
  if (!doc) return null;

  const commands = editorCommands({
    selected,
    nodeCount: nodes.length,
    onAdd: (kind) => void run(() => useDoc.getState().createNode(kind)),
    onUndo: () => void run(() => useDoc.getState().undo()),
    onRedo: () => void run(() => useDoc.getState().redo()),
    onSnapshot: () => setSnapshotOpen(true),
    onExport: () => setExportOpen(true),
    onImport: importer.open,
    onDelete: deleteSelected,
    onFrame: () => void run(() => useDoc.getState().frameCamera('fit')),
    onPreset: (preset) => void run(() => useDoc.getState().setStage({ preset })),
    onTab: setTab,
  });

  return (
    <ErrorBoundary>
      <AppShell
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        topBar={
          <TopBar
            roomId={roomId}
            name={doc.name}
            revision={doc.revision}
            online={online}
            preset={doc.stage.preset}
            onAdd={(kind) => void run(() => useDoc.getState().createNode(kind))}
            onPreset={(preset) => void run(() => useDoc.getState().setStage({ preset }))}
            onUndo={() => void run(() => useDoc.getState().undo())}
            onRedo={() => void run(() => useDoc.getState().redo())}
            onSnapshot={() => setSnapshotOpen(true)}
            onExport={() => setExportOpen(true)}
            onImport={importer.open}
            onCommand={() => setPaletteOpen(true)}
            onTogglePanel={togglePanel}
          />
        }
        sidePanel={
          <SidePanel
            tab={tab}
            onTab={setTab}
            counts={{ scene: nodes.length, assets: modelCount, inspector: selectedIds.length }}
          >
            {tab === 'scene' && <SceneTree doc={doc} />}
            {tab === 'assets' && (
              <AssetsPanel doc={doc} onImport={importer.open} onUploadImages={importer.openImages} />
            )}
            {tab === 'inspector' && <Inspector doc={doc} />}
          </SidePanel>
        }
        inspector={<Inspector doc={doc} />}
        statusBar={<StatusBar revision={doc.revision} nodes={nodes.length} />}
        banner={
          !online && status === 'ready' ? (
            <div className="flex items-center gap-2 border-b border-warning/20 bg-warning/10 px-3 py-1 text-[11px] text-warning">
              <span className="dot dot--pulse" />
              连接已断开，正在按 0.5→8s 退避重连；重连后以服务端场景为准。
            </div>
          ) : undefined
        }
      >
        <div className="relative h-full">
          <SceneCanvas doc={doc}>
            <CaptureBridge roomId={roomId} />
          </SceneCanvas>
          <ViewportHud
            nodeCount={nodes.length}
            onFit={() => void run(() => useDoc.getState().frameCamera('fit'))}
          />
          {nodes.length === 0 && (
            <EmptyViewport
              onImport={importer.open}
              onAddBox={() => void run(() => useDoc.getState().createNode('box'))}
            />
          )}
        </div>
      </AppShell>

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        nodes={nodes}
        onClose={() => setPaletteOpen(false)}
        onSelectNode={(id) => useSelection.getState().select(id)}
      />
      <SnapshotDialog
        open={snapshotOpen}
        roomId={roomId}
        revision={doc.revision}
        onClose={() => setSnapshotOpen(false)}
        onDone={(m) => push('success', m)}
        onError={(m) => push('error', m)}
      />
      <ExportDialog
        open={exportOpen}
        roomId={roomId}
        revision={doc.revision}
        selectedIds={selectedIds}
        onClose={() => setExportOpen(false)}
        onDone={(m) => push('success', m)}
        onError={(m) => push('error', m)}
      />
      <ConfirmDialog
        open={confirm !== null}
        title="删除节点"
        description={confirm ? `将删除「${confirm.name}」及其子节点，可用撤销恢复。` : ''}
        confirmText="删除"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target) void run(() => useDoc.getState().removeNode(target.id));
        }}
      />
      <Toaster items={items} onDismiss={dismiss} />
      <ImportOverlay dragging={importer.dragging} importing={importer.importing} />
      {importer.input}
    </ErrorBoundary>
  );
}
