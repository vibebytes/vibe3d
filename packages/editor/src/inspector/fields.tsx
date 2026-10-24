import { type ReactNode, useEffect, useState } from 'react';

export function hexOf(rgba: readonly number[]): string {
  return `#${rgba
    .slice(0, 3)
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function toRgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export function Section({
  title,
  children,
  right,
}: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-base-content/55">
          <span className="h-2.5 w-[2px] rounded-full bg-primary/70" />
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function NumberField({
  label,
  value,
  step = 0.1,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next)) onCommit(next);
    else setDraft(String(value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

export function Vec3Field({
  label,
  value,
  step = 0.1,
  onCommit,
}: {
  label: string;
  value: readonly number[];
  step?: number;
  onCommit: (v: [number, number, number]) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {[0, 1, 2].map((i) => (
        <NumberField
          key={i}
          label={`${label}${'xyz'[i]}`}
          step={step}
          value={value[i] ?? 0}
          onCommit={(v) => {
            const next = [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0] as [number, number, number];
            next[i] = v;
            onCommit(next);
          }}
        />
      ))}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onCommit,
}: { label: string; value: readonly number[]; onCommit: (rgba: [number, number, number, number]) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="color"
        value={hexOf(value)}
        onChange={(e) => onCommit(toRgba(e.target.value, value[3] ?? 1))}
        className="h-7 w-full"
      />
    </label>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-base-content/60">
      {label}
      <input
        type="checkbox"
        className="toggle toggle-xs toggle-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="select select-xs select-bordered"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
