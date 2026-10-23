import type { LightNode } from '@vibebyte/vibe3d-protocol';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, SelectField, ToggleRow, Vec3Field } from './fields';

const TYPES = ['directional', 'point', 'spot', 'ambient'] as const;

export function LightPanel({ node }: { node: LightNode }) {
  const patchNode = useDoc((s) => s.patchNode);
  const light = node.light;
  const update = (patch: Partial<typeof light>) => void patchNode(node.id, { light: { ...light, ...patch } });

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
        <ToggleRow
          label="投射阴影"
          checked={light.castShadow ?? false}
          onChange={(v) => update({ castShadow: v })}
        />
      </Section>

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
