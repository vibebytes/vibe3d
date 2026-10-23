import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CommandPalette } from '../common/CommandPalette';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ExportDialog } from '../common/ExportDialog';
import { SnapshotDialog } from '../common/SnapshotDialog';
import { Toaster, useToasts } from '../common/Toaster';
import { Inspector } from '../inspector/Inspector';
import { AppShell } from '../layout/AppShell';
import { SidePanel } from '../layout/SidePanel';
import { StatusBar } from '../layout/StatusBar';
import { TopBar } from '../layout/TopBar';
import { SceneTree } from '../scene/SceneTree';
import { useDoc } from '../stores/doc';
import { useSelection } from '../stores/selection';
import { useUi } from '../stores/ui';
import { CaptureBridge } from '../viewport/CaptureBridge';
import { SceneCanvas } from '../viewport/SceneCanvas';
import { HeadlessPage } from './HeadlessPage';
import { editorCommands } from './useEditorCommands';
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
      <div className="flex h-full items-center justify-center text-sm text-base-content/50">载入房间…</div>
    );
  if (error && !doc) return <div className="alert alert-error m-6 text-sm">{error}</div>;
  if (!doc) return null;

  const commands = editorCommands({
    selected,
    nodeCount: nodes.length,
    onAdd: (kind) => void run(() => useDoc.getState().createNode(kind)),
    onUndo: () => void run(() => useDoc.getState().undo()),
    onRedo: () => void run(() => useDoc.getState().redo()),
    onSnapshot: () => setSnapshotOpen(true),
    onExport: () => setExportOpen(true),
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
            onCommand={() => setPaletteOpen(true)}
            onTogglePanel={togglePanel}
          />
        }
        sidePanel={
          <SidePanel tab={tab} onTab={setTab}>
            {tab === 'scene' ? <SceneTree doc={doc} /> : <Inspector doc={doc} />}
          </SidePanel>
        }
        inspector={<Inspector doc={doc} />}
        statusBar={<StatusBar revision={doc.revision} nodes={nodes.length} />}
        banner={
          !online && status === 'ready' ? (
            <div className="border-b border-warning/20 bg-warning/10 px-3 py-1 text-[11px] text-warning">
              连接已断开，正在按 0.5→8s 退避重连；重连后以服务端场景为准。
            </div>
          ) : undefined
        }
      >
        <SceneCanvas doc={doc}>
          <CaptureBridge roomId={roomId} />
        </SceneCanvas>
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
    </ErrorBoundary>
  );
}
