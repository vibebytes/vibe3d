import type { ModelNode, SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useEffect, useState } from 'react';
import { useDoc } from '../stores/doc';
import { NumberField, Section, SelectField } from './fields';

export function ModelPanel({ node, doc }: { node: ModelNode; doc: SceneDoc }) {
  const playAnimation = useDoc((s) => s.playAnimation);
  const stopAnimation = useDoc((s) => s.stopAnimation);
  const asset = doc.assets[node.sha];
  const clips = asset?.gltf?.animations.map((a) => a.name) ?? [];
  const anim = node.anim;
  const [clip, setClip] = useState(anim?.clip ?? clips[0] ?? '');
  const [speed, setSpeed] = useState(anim?.speed ?? 1);
  useEffect(() => {
    setClip(anim?.clip ?? asset?.gltf?.animations[0]?.name ?? '');
    setSpeed(anim?.speed ?? 1);
  }, [anim?.clip, anim?.speed, asset]);

  return (
    <div className="space-y-4">
      <Section title="资源">
        <p className="text-[10px] break-all text-base-content/30 num">{node.sha}</p>
        {asset ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-base-content/60">
            <span>文件 {asset.name}</span>
            <span className="num">{(asset.bytes / 1024).toFixed(1)} KB</span>
            {asset.gltf && (
              <>
                <span>网格 {asset.gltf.meshes}</span>
                <span className="num">三角面 {asset.gltf.tris}</span>
                <span>材质 {asset.gltf.materials}</span>
                <span>贴图 {asset.gltf.textures}</span>
                <span>动画 {asset.gltf.animations.length}</span>
                <span>{asset.gltf.selfContained ? '自包含' : '有外链'}</span>
                <span>包围盒 {asset.gltf.size.diag.toFixed(2)}</span>
                <span>{asset.gltf.skins} 蒙皮</span>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-400/70">资源元数据缺失</p>
        )}
        {asset?.gltf?.unsupported.length ? (
          <p className="text-[10px] text-amber-400/70">不支持：{asset.gltf.unsupported.join(', ')}</p>
        ) : null}
      </Section>

      <Section title="动画">
        {clips.length === 0 ? (
          <p className="text-xs text-base-content/35">该模型无动画剪辑</p>
        ) : (
          <>
            <SelectField label="剪辑" value={clip} options={clips} onChange={setClip} />
            <NumberField label="速度" step={0.1} value={speed} onCommit={setSpeed} />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-xs flex-1"
                onClick={() => void playAnimation(node.id, { clip, speed })}
              >
                {anim?.playing ? '重新播放' : '播放'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs flex-1"
                disabled={!anim?.playing}
                onClick={() => void stopAnimation(node.id)}
              >
                停止
              </button>
            </div>
            <p className="text-[10px] text-base-content/30 num">
              {anim?.playing ? `播放中 · ${anim.clip ?? clips[0]} · ×${anim.speed}` : '已停止'}
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
