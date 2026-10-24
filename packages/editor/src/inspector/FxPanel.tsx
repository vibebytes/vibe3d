import type { ClipSpec, SceneDoc, SceneNode } from '@vibebyte/vibe3d-protocol';
import { useState } from 'react';
import { useDoc } from '../stores/doc';
import { NumberField, Section, SelectField, ToggleRow } from './fields';

const CLIPS = ['sway', 'ripple', 'float', 'flicker', 'spin'] as const;
const CHANNELS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'] as const;

type ClipType = (typeof CLIPS)[number];
type Channel = (typeof CHANNELS)[number];

const CLIP_LABELS: Record<ClipType, string> = {
  sway: '摆动 sway',
  ripple: '涟漪 ripple',
  float: '漂浮 float',
  flicker: '闪烁 flicker',
  spin: '自转 spin',
};

const DEFAULTS: Record<ClipType, { channel: Channel; amplitude: number; frequency: number }> = {
  sway: { channel: 'ry', amplitude: 0.25, frequency: 0.35 },
  ripple: { channel: 'py', amplitude: 0.12, frequency: 0.6 },
  float: { channel: 'py', amplitude: 0.25, frequency: 0.4 },
  flicker: { channel: 'sy', amplitude: 0.08, frequency: 1.5 },
  spin: { channel: 'ry', amplitude: 1, frequency: 0.25 },
};

interface Draft {
  type: ClipType;
  channel: Channel;
  amplitude: number;
  frequency: number;
}

function draftOf(clip: ClipSpec | undefined): Draft {
  const type = (clip && clip.type !== 'keyframes' ? clip.type : 'sway') as ClipType;
  const base = DEFAULTS[type];
  return {
    type,
    channel: (clip?.channel ?? base.channel) as Channel,
    amplitude: clip?.amplitude ?? base.amplitude,
    frequency: clip?.frequency ?? base.frequency,
  };
}

export function FxPanel({ doc, node }: { doc: SceneDoc; node: SceneNode | null }) {
  const defineAnimation = useDoc((s) => s.defineAnimation);
  const clearAnimation = useDoc((s) => s.clearAnimation);
  const createFx = useDoc((s) => s.createFx);
  const deleteFx = useDoc((s) => s.deleteFx);
  const clip = (node as { clip?: ClipSpec } | null)?.clip;
  const [draft, setDraft] = useState<Draft>(() => draftOf(clip));

  const apply = (next: Draft) => {
    setDraft(next);
    if (node) void defineAnimation(node.id, { ...next });
  };
  const origin = node?.transform.p ?? [0, 0, 0];

  return (
    <div className="space-y-4">
      <Section title="程序化动画">
        {node ? (
          <>
            <ToggleRow
              label="启用动画"
              checked={Boolean(clip)}
              onChange={(on) => {
                if (!node) return;
                if (on) void defineAnimation(node.id, { ...draft });
                else void clearAnimation(node.id);
              }}
            />
            <SelectField
              label="曲线"
              value={draft.type}
              options={CLIPS}
              onChange={(type) =>
                apply({ type, ...DEFAULTS[type] })
              }
              renderOption={(type) => CLIP_LABELS[type]}
            />
            <SelectField
              label="通道"
              value={draft.channel}
              options={CHANNELS}
              onChange={(channel) => apply({ ...draft, channel })}
            />
            <NumberField
              label="振幅"
              step={0.01}
              value={draft.amplitude}
              onCommit={(amplitude) => apply({ ...draft, amplitude })}
            />
            <NumberField
              label="频率"
              step={0.05}
              min={0}
              value={draft.frequency}
              onCommit={(frequency) => apply({ ...draft, frequency })}
            />
            <p className="text-[10px] leading-relaxed text-base-content/30">
              动画由时间函数推导，客户端每帧求值；不写关键帧，不参与快照。
            </p>
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-base-content/30">选中节点后可为其添加程序化动画。</p>
        )}
      </Section>

      <Section title="特效">
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-md border border-base-300 px-2 py-1 text-[10.5px] text-base-content/65 transition hover:border-primary/40 hover:text-primary"
            onClick={() =>
              void createFx({
                type: 'particles',
                nodeId: node?.id,
                position: [origin[0], origin[1] + 1.2, origin[2]] as [number, number, number],
              })
            }
          >
            添加粒子
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-base-300 px-2 py-1 text-[10.5px] text-base-content/65 transition hover:border-primary/40 hover:text-primary"
            onClick={() =>
              void createFx({
                type: 'shaft',
                position: [origin[0], origin[1] + 3, origin[2]] as [number, number, number],
                length: 6,
                radiusBottom: 0.7,
                radiusTop: 0.25,
              })
            }
          >
            添加光柱
          </button>
        </div>
        {doc.fx.length === 0 ? (
          <p className="text-[10px] leading-relaxed text-base-content/30">还没有特效。</p>
        ) : (
          <ul className="space-y-1">
            {doc.fx.map((fx) => (
              <li
                key={fx.id}
                className="flex items-center justify-between rounded-md border border-base-300/70 px-2 py-1 text-[10.5px]"
              >
                <span className="truncate text-base-content/70">
                  {fx.type === 'particles' ? '粒子' : '光柱'} · {fx.id}
                </span>
                <button
                  type="button"
                  className="text-base-content/40 transition hover:text-error"
                  onClick={() => void deleteFx(fx.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
