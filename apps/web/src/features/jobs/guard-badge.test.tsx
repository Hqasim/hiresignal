import type { GuardStatus } from '@hiresignal/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GuardBadge } from './guard-badge';

describe('GuardBadge', () => {
  it.each<[GuardStatus, string]>([
    ['clean', 'Clean'],
    ['flagged', 'Flagged'],
    ['quarantined', 'Quarantined'],
  ])('names the %s status in words next to its icon, not by colour alone', (status, label) => {
    const { container } = render(<GuardBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives each status a different icon', () => {
    const icons = (['clean', 'flagged', 'quarantined'] as const).map((status) => {
      const { container, unmount } = render(<GuardBadge status={status} />);
      const icon = container.querySelector('svg')?.getAttribute('class') ?? '';
      unmount();
      return icon;
    });

    expect(new Set(icons).size).toBe(3);
  });
});
