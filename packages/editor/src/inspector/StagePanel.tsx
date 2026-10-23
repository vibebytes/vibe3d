import type { SceneDoc } from '@vibebyte/vibe3d-protocol';
import { useDoc } from '../stores/doc';
import { NumberField, Section, SelectField, ToggleRow } from './fields';

const PRESETS = ['cine', 'clean', 'flat'] as const;

export function StagePanel({ doc }: { doc: SceneDoc }) {
  const setStage = useDoc((s) => s.setStage);
  const stage = doc.stage;
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
      <p className="text-[10px] leading-relaxed text-base-content/30">
        配方决定灯组与背景；自动曝光按背景与环境光亮度推导 EV，手工曝光优先。
      </p>
    </div>
  );
}
