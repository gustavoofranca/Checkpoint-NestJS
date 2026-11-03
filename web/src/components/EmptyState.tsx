import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="bg-dots rounded-card border border-dashed border-border p-8 text-center">
      <p className="font-display font-bold">{title}</p>
      {children !== undefined && <div className="mt-3 text-sm text-muted">{children}</div>}
    </div>
  );
}
