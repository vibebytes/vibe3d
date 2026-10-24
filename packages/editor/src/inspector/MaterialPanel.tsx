import type { AssetMeta, MapTransform, Material, MaterialPreset, MeshNode } from '@vibebyte/vibe3d-protocol';
import { useRef, useState } from 'react';
import { IMAGE_ACCEPT, imageAssets } from '../lib/asset-files';
import { assetUrl } from '../lib/rpc';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, ToggleRow } from './fields';

const MATERIAL_PRESETS: { id: MaterialPreset; label: string }[] = [
  { id: 'concrete', label: '混凝土' },
  { id: 'rust', label: '锈蚀金属' },
  { id: 'wet_moss', label: '湿苔藓' },
  { id: 'toon', label: '三渲二' },
  { id: 'water', label: '水面' },
  { id: 'glass', label: '玻璃' },
];

function mapShaOf(map: Material['map']): string | undefined {
  return typeof map === 'string' ? map : map?.sha;
}

function TextureField({
  value,
  assets,
  onPick,
  onUpload,
}: {
  value: Material['map'];
  assets: AssetMeta[];
  onPick(map: string | undefined): void;
  onUpload(file: File): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sha = mapShaOf(value);
  return (
    <div className="space-y-1.5">
      <label className="field">
        <span>颜色贴图</span>
        <select
          className="select select-xs select-bordered"
          value={sha ?? ''}
          onChange={(e) => onPick(e.target.value || undefined)}
        >
          <option value="">无</option>
          {assets.map((asset) => (
            <option key={asset.sha} value={asset.sha}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        {sha ? (
          <img
            src={assetUrl(sha)}
            alt="贴图预览"
            className="size-9 rounded-md border border-base-300 object-cover"
          />
        ) : (
          <span className="grid size-9 place-items-center rounded-md border border-dashed border-base-300 text-[9px] text-base-content/30">
            无
          </span>
        )}
        <button
          type="button"
          className="rounded-md border border-base-300 px-2 py-1 text-[10.5px] text-base-content/65 transition hover:border-primary/40 hover:text-primary"
          onClick={() => input.current?.click()}
        >
          上传新贴图
        </button>
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
      </div>
    </div>
  );
}

export function MaterialPanel({ node, material }: { node: MeshNode; material: Material | undefined }) {
  const patchMaterial = useDoc((s) => s.patchMaterial);
  const mapMaterial = useDoc((s) => s.mapMaterial);
  const createMaterial = useDoc((s) => s.createMaterial);
  const patchNode = useDoc((s) => s.patchNode);
  const doc = useDoc((s) => s.doc);
  const [uploadError, setUploadError] = useState<string | null>(null);
  if (!material) return <p className="text-xs text-base-content/40">材质缺失</p>;
  const update = (patch: Partial<Material>) => void patchMaterial(node.material, { ...material, ...patch });
  const textures = doc ? imageAssets(doc) : [];
  const mapSha = mapShaOf(material.map);
  const uv = typeof material.map === 'object' ? material.map : undefined;
  const setMap = (patch: Partial<MapTransform>) => void mapMaterial(node.material, patch);
  const applyPreset = (preset: MaterialPreset) => {
    void createMaterial(preset).then((id) => {
      if (id) return patchNode(node.id, { material: id });
    });
  };
  const uploadTexture = (file: File) => {
    setUploadError(null);
    void useDoc
      .getState()
      .uploadImages([file])
      .then((out) => {
        const first = out.uploaded[0];
        if (first) update({ map: first.sha });
        else setUploadError(out.failed[0]?.message ?? '上传失败');
      })
      .catch((err: unknown) => setUploadError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="space-y-4">
      <Section title="材质">
        <label className="field">
          <span>语义预设</span>
          <select
            className="select select-xs select-bordered"
            value=""
            onChange={(e) => {
              const preset = e.target.value as MaterialPreset;
              e.target.value = '';
              if (preset) applyPreset(preset);
            }}
          >
            <option value="">套用预设…</option>
            {MATERIAL_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
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

      <Section title="贴图">
        <TextureField
          value={material.map}
          assets={textures}
          onPick={(map) => update({ map })}
          onUpload={uploadTexture}
        />
        {mapSha && (
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              label="平铺 U"
              step={0.5}
              value={uv?.tiling?.[0] ?? 1}
              onCommit={(v) => setMap({ tiling: [Math.max(v, 0.01), uv?.tiling?.[1] ?? 1] })}
            />
            <NumberField
              label="平铺 V"
              step={0.5}
              value={uv?.tiling?.[1] ?? 1}
              onCommit={(v) => setMap({ tiling: [uv?.tiling?.[0] ?? 1, Math.max(v, 0.01)] })}
            />
            <NumberField
              label="偏移 U"
              step={0.1}
              value={uv?.offset?.[0] ?? 0}
              onCommit={(v) => setMap({ offset: [v, uv?.offset?.[1] ?? 0] })}
            />
            <NumberField
              label="偏移 V"
              step={0.1}
              value={uv?.offset?.[1] ?? 0}
              onCommit={(v) => setMap({ offset: [uv?.offset?.[0] ?? 0, v] })}
            />
            <NumberField
              label="旋转°"
              step={15}
              value={Math.round((((uv?.rotation ?? 0) * 180) / Math.PI) * 10) / 10}
              onCommit={(v) => setMap({ rotation: (v * Math.PI) / 180 })}
            />
          </div>
        )}
        <p className="text-[10px] leading-relaxed text-base-content/30">
          贴图按 sha 引用资产；HDRI 只能用于环境光照。
        </p>
        {uploadError && <p className="text-[10px] text-error">{uploadError}</p>}
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
