import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useEffect, useMemo, useState } from 'react';
import { useSelection } from '../stores/selection';
import { CameraPanel } from './CameraPanel';
import { LightPanel } from './LightPanel';
import { MaterialPanel } from './MaterialPanel';
import { ModelPanel } from './ModelPanel';
import { StagePanel } from './StagePanel';
import { TransformPanel } from './TransformPanel';

type TabId = 'node' | 'material' | 'light' | 'model' | 'stage' | 'camera';

export function Inspector({ doc }: { doc: SceneDoc }) {
  const selected = useSelection((s) => s.primary);
  const node = selected ? doc.nodes[selected] : null;
  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [];
    if (node) list.push({ id: 'node', label: '节点' });
    if (node?.kind === 'mesh') list.push({ id: 'material', label: '材质' });
    if (node?.kind === 'light') list.push({ id: 'light', label: '灯光' });
    if (node?.kind === 'model') list.push({ id: 'model', label: '模型' });
    list.push({ id: 'stage', label: '呈现' }, { id: 'camera', label: '相机' });
    return list;
  }, [node]);
  const [tab, setTab] = useState<TabId>('node');
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0]?.id ?? 'stage');
  }, [tabs, tab]);

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="tabs tabs-border tabs-xs shrink-0 px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'node' && node && <TransformPanel node={node} />}
        {tab === 'material' && node?.kind === 'mesh' && (
          <MaterialPanel node={node} material={doc.materials[node.material]} />
        )}
        {tab === 'light' && node?.kind === 'light' && <LightPanel node={node} />}
        {tab === 'model' && node?.kind === 'model' && <ModelPanel node={node} doc={doc} />}
        {tab === 'stage' && <StagePanel doc={doc} />}
        {tab === 'camera' && <CameraPanel doc={doc} />}
      </div>
    </div>
  );
}
