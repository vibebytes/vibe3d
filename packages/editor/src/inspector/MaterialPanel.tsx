import type { AssetMeta, Material, MeshNode } from '@vibebyte/vibe3d-protocol';
import { useRef, useState } from 'react';
import { IMAGE_ACCEPT, imageAssets } from '../lib/asset-files';
import { assetUrl } from '../lib/rpc';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, ToggleRow } from './fields';

function TextureField({
  value,
  assets,
  onPick,
  onUpload,
}: {
  value: string | undefined;
  assets: AssetMeta[];
  onPick(map: string | undefined): void;
  onUpload(file: File): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <label className="field">
        <span>颜色贴图</span>
        <select
          className="select select-xs select-bordered"
          value={value ?? ''}
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
        {value ? (
          <img
            src={assetUrl(value)}
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
  const doc = useDoc((s) => s.doc);
  const [uploadError, setUploadError] = useState<string | null>(null);
  if (!material) return <p className="text-xs text-base-content/40">材质缺失</p>;
  const update = (patch: Partial<Material>) => void patchMaterial(node.material, { ...material, ...patch });
  const textures = doc ? imageAssets(doc) : [];
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
