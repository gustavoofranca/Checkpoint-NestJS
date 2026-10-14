import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {children !== undefined && <div className="mt-3 text-sm text-muted">{children}</div>}
    </div>
  );
}
