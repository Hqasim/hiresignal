import type { GuardStatus } from '@hiresignal/contracts';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const GUARD_LOOK: Record<
  GuardStatus,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  clean: { label: 'Clean', icon: ShieldCheck, className: 'border-border text-foreground' },
  flagged: {
    label: 'Flagged',
    icon: ShieldAlert,
    className: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  quarantined: {
    label: 'Quarantined',
    icon: ShieldX,
    className: 'border-red-300 bg-red-50 text-red-800',
  },
};

/**
 * The injection guard's decision (SPEC §9.4) as an icon and a word, so the status never depends on
 * colour alone.
 */
export function GuardBadge({ status }: { status: GuardStatus }) {
  const { label, icon: Icon, className } = GUARD_LOOK[status];
  return (
    <Badge variant="outline" className={cn('gap-1', className)}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
