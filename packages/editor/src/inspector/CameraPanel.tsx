import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useDoc } from '../stores/doc';
import { NumberField, Section, SelectField, Vec3Field } from './fields';

const MODES = ['persp', 'ortho'] as const;

export function CameraPanel({ doc }: { doc: SceneDoc }) {
  const setCamera = useDoc((s) => s.setCamera);
  const frameCamera = useDoc((s) => s.frameCamera);
  const cam = doc.camera;
  const update = (patch: Partial<typeof cam>) => void setCamera({ ...cam, ...patch });

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
    </div>
  );
}
