import type { LightNode } from '@vibebyte/vibe3d-protocol';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, SelectField, ToggleRow, Vec3Field } from './fields';

const TYPES = ['directional', 'point', 'spot', 'ambient', 'area'] as const;

export function LightPanel({ node }: { node: LightNode }) {
  const patchNode = useDoc((s) => s.patchNode);
  const light = node.light;
  const update = (patch: Partial<typeof light>) => {
    const next: Partial<typeof light> = { ...light, ...patch };
    if (next.type !== 'area') {
      next.width = undefined;
      next.height = undefined;
    } else {
      next.castShadow = false;
    }
    void patchNode(node.id, { light: next as typeof light });
  };

  return (
    <div className="space-y-4">
      <Section title="灯光">
        <SelectField label="类型" value={light.type} options={TYPES} onChange={(type) => update({ type })} />
        <ColorField label="颜色" value={light.color} onCommit={(color) => update({ color })} />
        <NumberField
          label="强度"
          step={0.5}
          value={light.intensity}
          onCommit={(v) => update({ intensity: v })}
        />
        {light.type !== 'area' && (
          <ToggleRow
            label="投射阴影"
            checked={light.castShadow ?? false}
            onChange={(v) => update({ castShadow: v })}
          />
        )}
      </Section>

      {light.type === 'area' && (
        <Section title="柔光箱尺寸">
          <NumberField
            label="宽"
            step={0.1}
            min={0.01}
            value={light.width ?? 2}
            onCommit={(width) => update({ width })}
          />
          <NumberField
            label="高"
            step={0.1}
            min={0.01}
            value={light.height ?? 1}
            onCommit={(height) => update({ height })}
          />
        </Section>
      )}

      {light.type !== 'ambient' && (
        <Section title="位置">
          <Vec3Field
            label="位置"
            value={light.position ?? [0, 2, 0]}
            onCommit={(position) => update({ position })}
          />
          {light.type !== 'point' && (
            <Vec3Field
              label="目标"
              value={light.target ?? [0, 0, 0]}
              onCommit={(target) => update({ target })}
            />
          )}
        </Section>
      )}

      {light.type === 'spot' && (
        <Section title="光锥">
          <NumberField
            label="角度"
            step={0.05}
            value={light.angle ?? 0.6}
            onCommit={(v) => update({ angle: v })}
          />
          <NumberField
            label="羽化"
            step={0.05}
            min={0}
            max={1}
            value={light.penumbra ?? 0.3}
            onCommit={(v) => update({ penumbra: v })}
          />
        </Section>
      )}
    </div>
  );
}
