import type { Material, MeshNode } from '@vibebyte/vibe3d-protocol';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, ToggleRow } from './fields';

export function MaterialPanel({ node, material }: { node: MeshNode; material: Material | undefined }) {
  const patchMaterial = useDoc((s) => s.patchMaterial);
  if (!material) return <p className="text-xs text-base-content/40">材质缺失</p>;
  const update = (patch: Partial<Material>) => void patchMaterial(node.material, { ...material, ...patch });

  return (
    <div className="space-y-4">
      <Section title="材质">
        <ColorField
          label="基础色"
          value={material.baseColor}
          onCommit={(baseColor) => update({ baseColor })}
        />
        <NumberField
          label="金属"
          step={0.05}
          value={material.metalness}
          onCommit={(v) => update({ metalness: v })}
        />
        <NumberField
          label="粗糙"
          step={0.05}
          value={material.roughness}
          onCommit={(v) => update({ roughness: v })}
        />
        <NumberField
          label="透明"
          step={0.05}
          value={material.opacity}
          onCommit={(v) => update({ opacity: v })}
        />
      </Section>

      <Section title="自发光">
        <ColorField
          label="颜色"
          value={material.emissive}
          onCommit={([r, g, b]) => update({ emissive: [r, g, b] })}
        />
        <NumberField
          label="强度"
          step={0.1}
          value={material.emissiveIntensity}
          onCommit={(v) => update({ emissiveIntensity: v })}
        />
      </Section>

      <Section title="渲染">
        <ToggleRow label="双面" checked={material.doubleSided} onChange={(v) => update({ doubleSided: v })} />
        <p className="text-[10px] text-base-content/25 num">{node.material}</p>
      </Section>
    </div>
  );
}
