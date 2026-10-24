import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useRef, useState } from 'react';
import { hdriAssets } from '../lib/asset-files';
import { useDoc } from '../stores/doc';
import { ColorField, NumberField, Section, SelectField, ToggleRow } from './fields';
import { patchNpr, patchPost } from './stage-patch';

const PRESETS = ['cine', 'clean', 'flat'] as const;
const TONEMAPS = ['aces', 'linear', 'reinhard'] as const;

export function StagePanel({ doc }: { doc: SceneDoc }) {
  const setStage = useDoc((s) => s.setStage);
  const setEnv = useDoc((s) => s.setEnv);
  const setFog = useDoc((s) => s.setFog);
  const stage = doc.stage;
  const env = doc.env;
  const fog = env.fog;
  const hdris = hdriAssets(doc);
  const input = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const upload = (file: File) => {
    setUploadError(null);
    void useDoc
      .getState()
      .uploadImages([file])
      .then((out) => {
        const first = out.uploaded[0];
        if (first) void setEnv({ hdri: first.sha });
        else setUploadError(out.failed[0]?.message ?? '上传失败');
      })
      .catch((err: unknown) => setUploadError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className="space-y-4">
      <Section title="呈现">
        <SelectField
          label="配方"
          value={stage.preset}
          options={PRESETS}
          onChange={(preset) => void setStage({ preset })}
        />
        <NumberField
          label="曝光"
          step={0.1}
          min={0.1}
          max={8}
          value={stage.exposure ?? 1}
          onCommit={(exposure) => void setStage({ exposure })}
        />
        <ToggleRow
          label="自动曝光"
          checked={stage.autoExposure}
          onChange={(autoExposure) => void setStage({ autoExposure })}
        />
        <ToggleRow label="地面" checked={stage.ground} onChange={(ground) => void setStage({ ground })} />
        <ToggleRow
          label="保留模型灯"
          checked={stage.keepModelLights}
          onChange={(keepModelLights) => void setStage({ keepModelLights })}
        />
      </Section>

      <Section title="环境">
        <label className="field">
          <span>HDRI</span>
          <select
            className="select select-xs select-bordered"
            value={env.hdri ?? ''}
            onChange={(e) => void setEnv({ hdri: e.target.value || undefined })}
          >
            <option value="">程序化天光</option>
            {hdris.map((asset) => (
              <option key={asset.sha} value={asset.sha}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="w-full rounded-md border border-base-300 px-2 py-1 text-[10.5px] text-base-content/65 transition hover:border-primary/40 hover:text-primary"
          onClick={() => input.current?.click()}
        >
          上传 .hdr / .exr
        </button>
        <input
          ref={input}
          type="file"
          accept=".hdr,.exr"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload(file);
          }}
        />
        <ColorField
          label="背景色"
          value={env.background}
          onCommit={(background) => void setEnv({ background })}
        />
        <ColorField label="环境光" value={env.ambient} onCommit={(ambient) => void setEnv({ ambient })} />
        <NumberField
          label="环境强度"
          step={0.05}
          min={0}
          value={env.ambientIntensity}
          onCommit={(ambientIntensity) => void setEnv({ ambientIntensity })}
        />
        <p className="text-[10px] leading-relaxed text-base-content/30">
          {env.hdri ? 'HDRI 同时驱动背景与环境光照' : '未选 HDRI 时使用背景色 + 程序化天光'}
        </p>
        {uploadError && <p className="text-[10px] text-error">{uploadError}</p>}
      </Section>

      <Section title="雾">
        <ToggleRow
          label="启用雾"
          checked={Boolean(fog)}
          onChange={(on) => void setFog(on ? { near: 6, far: 40, color: env.background } : null)}
        />
        {fog && (
          <>
            <NumberField
              label="近平面"
              step={0.5}
              min={0}
              value={fog.near}
              onCommit={(near) => void setFog({ ...fog, near })}
            />
            <NumberField
              label="远平面"
              step={1}
              min={0}
              value={fog.far}
              onCommit={(far) => void setFog({ ...fog, far })}
            />
            <p className="text-[10px] leading-relaxed text-base-content/30">
              雾按世界距离插值到雾色；仅影响视图与截图，不改节点材质。
            </p>
          </>
        )}
      </Section>

      <Section title="三渲二">
        <ToggleRow
          label="描边"
          checked={Boolean(stage.npr?.outline)}
          onChange={(on) =>
            void setStage({
              npr: patchNpr(stage.npr, {
                outline: on
                  ? {
                      width: stage.npr?.outline?.width ?? 1.5,
                      ...(stage.npr?.outline?.color ? { color: stage.npr.outline.color } : {}),
                    }
                  : null,
              }),
            })
          }
        />
        {stage.npr?.outline && (
          <>
            <NumberField
              label="线宽"
              step={0.1}
              min={0}
              max={10}
              value={stage.npr.outline.width ?? 1.5}
              onCommit={(width) =>
                void setStage({ npr: patchNpr(stage.npr, { outline: { ...stage.npr?.outline, width } }) })
              }
            />
            <ColorField
              label="描边色"
              value={stage.npr.outline.color ?? [0.04, 0.06, 0.08, 1]}
              onCommit={(color) =>
                void setStage({ npr: patchNpr(stage.npr, { outline: { ...stage.npr?.outline, color } }) })
              }
            />
          </>
        )}
        <ToggleRow
          label="色阶"
          checked={Boolean(stage.npr?.rampSteps)}
          onChange={(on) => void setStage({ npr: patchNpr(stage.npr, { rampSteps: on ? 3 : null }) })}
        />
        {stage.npr?.rampSteps && (
          <NumberField
            label="色阶数"
            step={1}
            min={2}
            max={8}
            value={stage.npr.rampSteps}
            onCommit={(steps) =>
              void setStage({ npr: patchNpr(stage.npr, { rampSteps: Math.round(steps) }) })
            }
          />
        )}
        <NumberField
          label="边缘光"
          step={0.05}
          min={0}
          max={1}
          value={stage.npr?.rim ?? 0}
          onCommit={(rim) => void setStage({ npr: patchNpr(stage.npr, { rim: rim > 0 ? rim : null }) })}
        />
        <p className="text-[10px] leading-relaxed text-base-content/30">
          描边为反壳子网格，色阶走逐面着色；三渲二只作用于网格材质，不改模型。
        </p>
      </Section>

      <Section title="后处理">
        <SelectField
          label="色调映射"
          value={stage.post?.tonemap ?? 'aces'}
          options={TONEMAPS}
          onChange={(tonemap) =>
            void setStage({ post: patchPost(stage.post, { tonemap: tonemap === 'aces' ? null : tonemap }) })
          }
        />
        <ToggleRow
          label="Bloom"
          checked={Boolean(stage.post?.bloom)}
          onChange={(on) =>
            void setStage({ post: patchPost(stage.post, { bloom: on ? { intensity: 1 } : null }) })
          }
        />
        {stage.post?.bloom && (
          <>
            <NumberField
              label="强度"
              step={0.1}
              min={0}
              max={5}
              value={stage.post.bloom.intensity ?? 1}
              onCommit={(intensity) =>
                void setStage({ post: patchPost(stage.post, { bloom: { ...stage.post?.bloom, intensity } }) })
              }
            />
            <NumberField
              label="阈值"
              step={0.05}
              min={0}
              max={2}
              value={stage.post.bloom.threshold ?? 0.2}
              onCommit={(threshold) =>
                void setStage({ post: patchPost(stage.post, { bloom: { ...stage.post?.bloom, threshold } }) })
              }
            />
          </>
        )}
        <ToggleRow
          label="景深"
          checked={Boolean(stage.post?.dof)}
          onChange={(on) =>
            void setStage({
              post: patchPost(stage.post, { dof: on ? { aperture: 0.02, focusDistance: 6 } : null }),
            })
          }
        />
        {stage.post?.dof && (
          <>
            <NumberField
              label="光圈"
              step={0.005}
              min={0}
              max={1}
              value={stage.post.dof.aperture ?? 0.02}
              onCommit={(aperture) =>
                void setStage({ post: patchPost(stage.post, { dof: { ...stage.post?.dof, aperture } }) })
              }
            />
            <NumberField
              label="焦距"
              step={0.5}
              min={0}
              max={100}
              value={stage.post.dof.focusDistance ?? 6}
              onCommit={(focusDistance) =>
                void setStage({ post: patchPost(stage.post, { dof: { ...stage.post?.dof, focusDistance } }) })
              }
            />
          </>
        )}
        <ToggleRow
          label="SSAO"
          checked={Boolean(stage.post?.ssao)}
          onChange={(on) =>
            void setStage({
              post: patchPost(stage.post, { ssao: on ? { radius: 0.6, intensity: 1 } : null }),
            })
          }
        />
        {stage.post?.ssao && (
          <>
            <NumberField
              label="半径"
              step={0.1}
              min={0}
              max={5}
              value={stage.post.ssao.radius ?? 0.6}
              onCommit={(radius) =>
                void setStage({ post: patchPost(stage.post, { ssao: { ...stage.post?.ssao, radius } }) })
              }
            />
            <NumberField
              label="强度"
              step={0.1}
              min={0}
              max={5}
              value={stage.post.ssao.intensity ?? 1}
              onCommit={(intensity) =>
                void setStage({ post: patchPost(stage.post, { ssao: { ...stage.post?.ssao, intensity } }) })
              }
            />
          </>
        )}
        <p className="text-[10px] leading-relaxed text-base-content/30">
          后处理只在开了 Bloom / 景深 / SSAO 或非 ACES 色调映射时启用，顺序为 SSAO → 景深 → Bloom。
        </p>
      </Section>

      <p className="text-[10px] leading-relaxed text-base-content/30">
        配方决定灯组与背景；自动曝光按背景与环境光亮度推导 EV，手工曝光优先。
      </p>
    </div>
  );
}
