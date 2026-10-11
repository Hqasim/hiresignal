import type { Citation, TextSpan } from '@hiresignal/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { C01_SCORECARD } from '@/test/fixtures';

import { ScorecardPanel } from './scorecard-panel';

/** The panel wired to state, as the candidate page wires it. */
function StatefulPanel({ onCite }: { onCite?: (citation: Citation) => void }) {
  const [active, setActive] = useState<TextSpan | null>(null);
  return (
    <ScorecardPanel
      scorecard={C01_SCORECARD}
      activeSpan={active}
      onCite={(citation) => {
        setActive(citation.span);
        onCite?.(citation);
      }}
    />
  );
}

describe('ScorecardPanel', () => {
  it('shows the computed score, the must-haves and each requirement’s rating in words', () => {
    render(<StatefulPanel />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/2\/2 met/)).toHaveTextContent('2/2 met · 2 strong');
    expect(screen.getAllByText('Strong')).toHaveLength(2);
    expect(screen.getByText('Unclear')).toBeInTheDocument();
    expect(screen.getByText(C01_SCORECARD.summary)).toBeInTheDocument();
  });

  it('says when verification downgraded a rating', () => {
    render(<StatefulPanel />);

    expect(screen.getByText(/Downgraded to unclear/)).toBeInTheDocument();
  });

  it('marks the picked citation as pressed and reports its span', async () => {
    const user = userEvent.setup();
    const onCite = vi.fn();
    render(<StatefulPanel onCite={onCite} />);
    const chip = screen.getByRole('button', { name: /Shipped a retrieval-augmented assistant/ });

    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(onCite).toHaveBeenCalledWith(
      expect.objectContaining({ quote: 'Shipped a retrieval-augmented assistant' }),
    );
    const others = screen
      .getAllByRole('button', { pressed: true })
      .filter((button) => button !== chip);
    expect(others).toHaveLength(0);
  });

  it('works from the keyboard: Tab to a citation, Enter to show it', async () => {
    const user = userEvent.setup();
    const onCite = vi.fn();
    render(<StatefulPanel onCite={onCite} />);

    await user.tab();
    expect(screen.getByRole('button', { name: /Built the TypeScript and React/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onCite).toHaveBeenCalledTimes(1);
  });

  it('lists strengths, and says when there are no concerns', () => {
    render(<StatefulPanel />);

    expect(screen.getByText('Production RAG')).toBeInTheDocument();
    expect(screen.getByText('None noted.')).toBeInTheDocument();
    expect(screen.getByText(/prompt/)).toHaveTextContent('screening@1');
  });
});
