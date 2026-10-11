import type { Rating } from '@hiresignal/contracts';
import { CircleCheck, CircleDashed, CircleHelp, CircleX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const RATING_LOOK: Record<Rating, { label: string; icon: typeof CircleCheck; className: string }> =
  {
    strong: {
      label: 'Strong',
      icon: CircleCheck,
      className: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    },
    partial: {
      label: 'Partial',
      icon: CircleDashed,
      className: 'border-sky-300 bg-sky-50 text-sky-900',
    },
    none: { label: 'None', icon: CircleX, className: 'border-border text-muted-foreground' },
    unclear: {
      label: 'Unclear',
      icon: CircleHelp,
      className: 'border-border text-muted-foreground',
    },
  };

/** A requirement's rating (SPEC §9.2 rubric) as an icon and a word. */
export function RatingChip({ rating }: { rating: Rating }) {
  const { label, icon: Icon, className } = RATING_LOOK[rating];
  return (
    <Badge variant="outline" className={cn('gap-1', className)}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
