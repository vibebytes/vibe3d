import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { useMemo } from 'react';
import { Icon, type IconName } from '../common/Icon';
import { useSelection } from '../stores/selection';

const ICON: Record<SceneNode['kind'], IconName> = {
  group: 'layers',
  mesh: 'box',
  light: 'sun',
  model: 'model',
};

export function SceneTree({ doc }: { doc: SceneDoc }) {
  const ids = useSelection((s) => s.ids);
  const hoverId = useSelection((s) => s.hoverId);
  const select = useSelection((s) => s.select);
  const hover = useSelection((s) => s.hover);

  const children = useMemo(() => {
    const map = new Map<string | null, SceneNode[]>();
    for (const node of Object.values(doc.nodes)) {
      const list = map.get(node.parent) ?? [];
      list.push(node);
      map.set(node.parent, list);
    }
    return map;
  }, [doc.nodes]);

  const rows: { node: SceneNode; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      rows.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="section-title">场景树</span>
        <span className="num text-[10px] text-base-content/45">{rows.length} 项</span>
      </div>
      {rows.length === 0 ? (
        <div className="mx-3 mt-2 rounded-lg border border-dashed border-base-300 px-3 py-5 text-center">
          <p className="text-[11.5px] text-base-content/55">还没有节点</p>
          <p className="mt-1 text-[10px] text-base-content/40">用顶栏添加几何体，或拖入模型</p>
        </div>
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
          {rows.map(({ node, depth }) => (
            <li key={node.id}>
              <button
                type="button"
                className="scene-row"
                data-selected={ids.includes(node.id) ? 'true' : 'false'}
                data-hover={hoverId === node.id ? 'true' : 'false'}
                style={{ paddingLeft: `${0.4 + depth * 0.7}rem` }}
                onClick={(e) => select(node.id, { additive: e.shiftKey || e.metaKey || e.ctrlKey })}
                onMouseEnter={() => hover(node.id)}
                onMouseLeave={() => hover(null)}
              >
                <span className={node.visible ? 'text-base-content/55' : 'text-base-content/25'}>
                  <Icon name={ICON[node.kind]} size={13} />
                </span>
                <span
                  className={`flex-1 truncate ${node.visible ? '' : 'text-base-content/35 line-through'}`}
                >
                  {node.name}
                </span>
                {node.kind === 'group' && (
                  <span className="num shrink-0 text-[9px] text-base-content/35">
                    {children.get(node.id)?.length ?? 0}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
