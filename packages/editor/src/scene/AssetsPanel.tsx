import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useMemo } from 'react';
import { Icon } from '../common/Icon';
import { formatBytes, hdriAssets, imageAssets } from '../lib/asset-files';
import { assetUrl } from '../lib/rpc';
import { useSelection } from '../stores/selection';

interface AssetsPanelProps {
  doc: SceneDoc;
  onImport(): void;
  onUploadImages(): void;
}

export function AssetsPanel({ doc, onImport, onUploadImages }: AssetsPanelProps) {
  const selected = useSelection((s) => s.ids);
  const select = useSelection((s) => s.select);

  const models = useMemo(
    () =>
      Object.values(doc.nodes)
        .filter((n) => n.kind === 'model')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [doc.nodes],
  );
  const images = useMemo(() => [...imageAssets(doc), ...hdriAssets(doc)], [doc]);
  const shas = new Set(models.map((n) => (n.kind === 'model' ? n.sha : '')));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="section-title">素材库</span>
        <span className="num text-[10px] text-base-content/45">
          {models.length} 节点 · {shas.size} 文件 · {images.length} 图片
        </span>
      </div>

      <div className="space-y-2 px-3">
        <button
          type="button"
          onClick={onImport}
          className="group flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-base-300 bg-base-100/40 px-3 py-4 transition hover:border-primary/50 hover:bg-primary/5"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-base-300/60 text-base-content/55 transition group-hover:bg-primary/15 group-hover:text-primary">
            <Icon name="import" size={15} />
          </span>
          <span className="text-[12px] text-base-content/75">拖入或点击导入</span>
          <span className="text-[10px] text-base-content/40">.glb · .gltf · 图片 · 可多选</span>
        </button>
        <button
          type="button"
          onClick={onUploadImages}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-base-300 px-2 py-1.5 text-[11px] text-base-content/70 transition hover:border-primary/40 hover:text-primary"
        >
          <Icon name="assets" size={12} />
          上传贴图 / HDRI
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between px-3 pb-1.5">
        <span className="section-title">已导入模型</span>
      </div>

      {models.length === 0 ? (
        <p className="px-3 py-2 text-[11.5px] leading-relaxed text-base-content/50">
          还没有模型。导入后会按包围盒自动缩放到 1.5m 并落到地面。
        </p>
      ) : (
        <ul className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-auto px-2 pb-3">
          {models.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="asset-card w-full text-left"
                data-selected={selected.includes(node.id) ? 'true' : 'false'}
                onClick={() => select(node.id)}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-base-300/50 text-base-content/50">
                  <Icon name="model" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-base-content/90">{node.name}</span>
                  <span className="num mt-0.5 block truncate text-[10px] text-base-content/45">
                    {node.kind === 'model' ? node.sha.slice(0, 12) : ''}
                  </span>
                </span>
                <span className="chip h-4 shrink-0 px-1 text-[9px]">GLTF</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between px-3 pb-1.5">
        <span className="section-title">图片素材</span>
        <span className="num text-[10px] text-base-content/35">{images.length}</span>
      </div>
      {images.length === 0 ? (
        <p className="px-3 pb-3 text-[11px] leading-relaxed text-base-content/40">
          上传 PNG / JPG / HDR / EXR，可在材质里选贴图，或用作环境光照。
        </p>
      ) : (
        <ul className="scroll-thin max-h-[188px] space-y-1.5 overflow-auto px-2 pb-3">
          {images.map((asset) => (
            <li
              key={asset.sha}
              className="flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-100/30 px-2 py-1.5"
              title={asset.name}
            >
              <span className="size-9 shrink-0 overflow-hidden rounded-md bg-base-300/50">
                {asset.image?.hdri ? (
                  <span className="grid h-full place-items-center text-[8px] tracking-wide text-base-content/50">
                    HDR
                  </span>
                ) : (
                  <img
                    src={assetUrl(asset.sha)}
                    alt={asset.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] text-base-content/85">{asset.name}</span>
                <span className="num mt-0.5 block text-[9.5px] text-base-content/40">
                  {asset.image ? `${asset.image.width}×${asset.image.height} · ` : ''}
                  {formatBytes(asset.bytes)}
                </span>
              </span>
              <span className="chip h-4 shrink-0 px-1 text-[9px]">
                {asset.image?.hdri ? 'HDRI' : (asset.mime.split('/')[1] ?? 'IMG').toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
