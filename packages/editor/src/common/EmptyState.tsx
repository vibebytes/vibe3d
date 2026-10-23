import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? 'p-4' : 'p-8'}`}>
      <div className="text-xs font-medium text-base-content/60">{title}</div>
      {description && (
        <div className="max-w-56 text-[11px] leading-relaxed text-base-content/35">{description}</div>
      )}
      {action}
    </div>
  );
}
