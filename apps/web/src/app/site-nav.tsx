import { Link, useMatch } from 'react-router';

import { cn } from '@/lib/utils';

/**
 * Primary navigation. "Candidates" covers a job's list and every candidate page, so the active
 * link comes from route patterns rather than one URL. `aria-current` marks it for screen readers,
 * and an underline, not only colour, for sighted users.
 */
export function SiteNav() {
  const onAsk = useMatch('/jobs/:slug/ask') !== null;
  const onJob = useMatch('/jobs/:slug') !== null;
  const onCandidate = useMatch('/candidates/:id') !== null;
  const onOps = useMatch('/ops') !== null;
  const onAbout = useMatch('/about') !== null;
  const items = [
    { to: '/', label: 'Candidates', active: onJob || onCandidate },
    { to: '/ask', label: 'Ask', active: onAsk },
    { to: '/ops', label: 'Ops', active: onOps },
    { to: '/about', label: 'About', active: onAbout },
  ];

  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map(({ to, label, active }) => (
          <li key={to}>
            <Link
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-sm py-1 underline-offset-8 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'font-medium text-foreground underline decoration-2'
                  : 'text-muted-foreground',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
