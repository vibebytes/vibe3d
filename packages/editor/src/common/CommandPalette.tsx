import { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run(): void;
}

export interface PaletteNode {
  id: string;
  name: string;
}

interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  nodes: PaletteNode[];
  onClose(): void;
  onSelectNode(id: string): void;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
  run(): void;
}

export function CommandPalette({ open, commands, nodes, onClose, onSelectNode }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const cmdRows = commands
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .map((c) => ({ key: `cmd:${c.id}`, label: c.label, hint: c.hint, run: c.run }));
    const nodeRows = nodes
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 40)
      .map((n) => ({ key: `node:${n.id}`, label: n.name, hint: n.id, run: () => onSelectNode(n.id) }));
    return [...cmdRows, ...nodeRows];
  }, [commands, nodes, query, onSelectNode]);

  useEffect(() => {
    setActive((i) => (rows.length === 0 ? 0 : Math.min(i, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[active];
        if (row) {
          row.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, rows, active, onClose]);

  if (!open) return null;
  const commandCount = rows.filter((r) => r.key.startsWith('cmd:')).length;

  return (
    <dialog open aria-modal="true" className="modal modal-open items-start pt-[12vh]">
      <div className="modal-box max-w-lg p-0">
        <div className="border-b border-base-300 p-2">
          <input
            ref={inputRef}
            className="input input-ghost input-sm w-full text-sm focus:outline-none"
            placeholder="搜索命令或节点…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
        </div>
        <ul className="menu max-h-72 w-full overflow-auto p-1">
          {rows.length === 0 && <li className="px-3 py-2 text-[11px] text-base-content/35">没有匹配项</li>}
          {rows.map((row, i) => {
            const isCmd = row.key.startsWith('cmd:');
            const firstNode = isCmd === false && i === commandCount;
            return (
              <li key={row.key}>
                {firstNode && (
                  <div className="px-3 pt-2 pb-1 text-[10px] tracking-wide text-base-content/30">节点</div>
                )}
                {i === 0 && isCmd && (
                  <div className="px-3 pt-1 pb-1 text-[10px] tracking-wide text-base-content/30">命令</div>
                )}
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-btn px-3 py-1.5 text-left text-xs ${i === active ? 'bg-base-300' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    row.run();
                    onClose();
                  }}
                >
                  <span className="truncate">{row.label}</span>
                  {row.hint && (
                    <span className="num ml-auto shrink-0 text-[10px] text-base-content/30">{row.hint}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-base-300 px-3 py-1.5 text-[10px] text-base-content/30">
          <span>↑↓ 选择</span>
          <span>↵ 执行</span>
          <span>esc 关闭</span>
        </div>
      </div>
    </dialog>
  );
}
