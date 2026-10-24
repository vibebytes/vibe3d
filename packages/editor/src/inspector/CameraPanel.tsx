import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useState } from 'react';
import { useDoc } from '../stores/doc';
import { NumberField, Section, SelectField, Vec3Field } from './fields';

const MODES = ['persp', 'ortho'] as const;

export function CameraPanel({ doc }: { doc: SceneDoc }) {
  const setCamera = useDoc((s) => s.setCamera);
  const frameCamera = useDoc((s) => s.frameCamera);
  const saveCamera = useDoc((s) => s.saveCamera);
  const useCamera = useDoc((s) => s.useCamera);
  const deleteCamera = useDoc((s) => s.deleteCamera);
  const applyCameraPreset = useDoc((s) => s.applyCameraPreset);
  const [name, setName] = useState('');
  const cam = doc.camera;
  const update = (patch: Partial<typeof cam>) => void setCamera({ ...cam, ...patch });
  const saved = Object.keys(doc.cameras ?? {});
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void saveCamera(trimmed);
    setName('');
  };

  return (
    <div className="space-y-4">
      <Section title="相机">
        <SelectField label="投影" value={cam.mode} options={MODES} onChange={(mode) => update({ mode })} />
        <NumberField
          label="视野"
          step={1}
          min={1}
          max={179}
          value={cam.fov}
          onCommit={(fov) => update({ fov })}
        />
        {cam.mode === 'ortho' && (
          <NumberField label="缩放" step={0.1} value={cam.zoom} onCommit={(zoom) => update({ zoom })} />
        )}
      </Section>

      <Section title="位置">
        <Vec3Field label="位置" value={cam.p} onCommit={(p) => update({ p })} />
        <Vec3Field label="目标" value={cam.target} onCommit={(target) => update({ target })} />
      </Section>

      <Section title="取景">
        <div className="grid grid-cols-3 gap-1">
          {(['fit', 'close', 'wide'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => void frameCamera(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-xs w-full"
          onClick={() => void frameCamera('fit')}
        >
          重置取景
        </button>
      </Section>

      <Section title="预设">
        <button
          type="button"
          className="btn btn-outline btn-xs w-full"
          onClick={() => void applyCameraPreset('miniature_45')}
        >
          微缩 45°
        </button>
      </Section>

      <Section title="机位">
        <div className="flex gap-1">
          <input
            className="input input-xs input-bordered min-w-0 flex-1"
            placeholder="机位名，如 hero"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button type="button" className="btn btn-xs" disabled={!name.trim()} onClick={save}>
            保存
          </button>
        </div>
        {saved.length === 0 && (
          <p className="text-[10px] leading-relaxed text-base-content/30">还没有存过的机位。</p>
        )}
        <ul className="space-y-1">
          {saved.map((key) => (
            <li key={key} className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-xs min-w-0 flex-1 justify-start truncate"
                onClick={() => void useCamera(key)}
              >
                {key}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-base-content/40 hover:text-error"
                onClick={() => void deleteCamera(key)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
