import type { SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { useMemo } from 'react';
import { useSelection } from '../stores/selection';

const ICON: Record<SceneNode['kind'], string> = { group: '▣', mesh: '◆', light: '☀', model: '◈' };

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

  if (rows.length === 0) return <p className="px-3 py-4 text-xs text-base-content/40">空场景</p>;

  return (
    <ul className="menu menu-sm w-full gap-0.5 p-1">
      {rows.map(({ node, depth }) => (
        <li key={node.id}>
          <button
            type="button"
            className={`flex items-center gap-2 ${ids.includes(node.id) ? 'active' : ''} ${hoverId === node.id ? 'bg-base-content/5' : ''} ${node.visible ? '' : 'opacity-40'}`}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
            onClick={(e) => select(node.id, { additive: e.shiftKey || e.metaKey || e.ctrlKey })}
            onMouseEnter={() => hover(node.id)}
            onMouseLeave={() => hover(null)}
          >
            <span className="w-3 text-center text-[10px] text-base-content/50">{ICON[node.kind]}</span>
            <span className="truncate text-xs">{node.name}</span>
            <span className="ml-auto text-[10px] text-base-content/25">{node.kind}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
