import type { PaletteCommand } from '../common/CommandPalette';
import type { SideTab } from '../layout/SidePanel';

type Preset = 'cine' | 'clean' | 'flat';

interface EditorCommandArgs {
  selected: string | null;
  nodeCount: number;
  onAdd(kind: 'box' | 'sphere' | 'cylinder' | 'light'): void;
  onUndo(): void;
  onRedo(): void;
  onSnapshot(): void;
  onExport(): void;
  onDelete(): void;
  onFrame(): void;
  onPreset(preset: Preset): void;
  onTab(tab: SideTab): void;
}

export function editorCommands(a: EditorCommandArgs): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    { id: 'add.box', label: '添加立方体', run: () => a.onAdd('box') },
    { id: 'add.sphere', label: '添加球体', run: () => a.onAdd('sphere') },
    { id: 'add.cylinder', label: '添加圆柱', run: () => a.onAdd('cylinder') },
    { id: 'add.light', label: '添加灯光', run: () => a.onAdd('light') },
    { id: 'history.undo', label: '撤销', hint: '⌘Z', run: a.onUndo },
    { id: 'history.redo', label: '重做', hint: '⇧⌘Z', run: a.onRedo },
    { id: 'render.snapshot', label: '离屏快照…', run: a.onSnapshot },
    { id: 'export.glb', label: '导出 GLB…', run: a.onExport },
    { id: 'panel.scene', label: '切到场景面板', run: () => a.onTab('scene') },
    { id: 'panel.inspector', label: '切到属性面板', run: () => a.onTab('inspector') },
    ...(['cine', 'clean', 'flat'] as Preset[]).map((preset) => ({
      id: `stage.${preset}`,
      label: `呈现配方：${preset}`,
      run: () => a.onPreset(preset),
    })),
  ];
  if (a.selected) {
    commands.push({ id: 'camera.frame', label: '聚焦选中节点', hint: 'F', run: a.onFrame });
    commands.push({ id: 'node.delete', label: '删除选中节点', run: a.onDelete });
  }
  if (a.nodeCount === 0)
    commands.push({ id: 'hint.empty', label: '场景为空，先从添加立方体开始', run: () => a.onAdd('box') });
  return commands;
}
