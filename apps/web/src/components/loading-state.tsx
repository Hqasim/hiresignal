import { Skeleton } from '@/components/ui/skeleton';

/**
 * The loading state of an async view: skeleton rows in the shape of the content, and a label that
 * screen readers announce instead of the decorative shapes.
 */
export function LoadingState({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} aria-hidden className="h-9 w-full" />
      ))}
    </div>
  );
}
