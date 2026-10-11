import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

/** The empty state of an async view: what's missing and, optionally, how to fill it. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <Inbox aria-hidden className="size-5 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {children !== undefined && (
        <div className="max-w-prose text-sm text-muted-foreground">{children}</div>
      )}
    </div>
  );
}
