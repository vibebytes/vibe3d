import type { SceneNode } from '@vibebyte/vibe3d-protocol';
import { useEffect, useState } from 'react';
import { useDoc } from '../stores/doc';
import { Section, Vec3Field } from './fields';

export function TransformPanel({ node }: { node: SceneNode }) {
  const patchNode = useDoc((s) => s.patchNode);
  const removeNode = useDoc((s) => s.removeNode);
  const [name, setName] = useState(node.name);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft when switching nodes
  useEffect(() => setName(node.name), [node.name, node.id]);
  const t = node.transform;
  const patch = (transform: typeof t) => void patchNode(node.id, { transform });

  return (
    <div className="space-y-4">
      <Section title="节点">
        <label className="field">
          <span>名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== node.name && void patchNode(node.id, { name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="flex items-center justify-between text-xs text-base-content/60">
          可见
          <input
            type="checkbox"
            className="toggle toggle-xs toggle-primary"
            checked={node.visible}
            onChange={(e) => void patchNode(node.id, { visible: e.target.checked })}
          />
        </label>
        <p className="text-[10px] text-base-content/25 num">
          {node.kind} · {node.id}
        </p>
      </Section>

      <Section title="变换">
        <Vec3Field label="位置" value={t.p} onCommit={(p) => patch({ ...t, p })} />
        <Vec3Field label="旋转" step={1} value={t.r} onCommit={(r) => patch({ ...t, r })} />
        <Vec3Field label="缩放" step={0.05} value={t.s} onCommit={(s) => patch({ ...t, s })} />
      </Section>

      <button
        type="button"
        className="btn btn-error btn-outline btn-xs w-full"
        onClick={() => void removeNode(node.id)}
      >
        删除节点
      </button>
    </div>
  );
}
