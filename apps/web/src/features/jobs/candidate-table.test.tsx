import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { candidateId, CANDIDATES } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';

import { CandidateTable } from './candidate-table';

function rankedRows() {
  const table = screen.getByRole('table');
  // The first row is the header.
  return within(table).getAllByRole('row').slice(1);
}

describe('CandidateTable', () => {
  it('keeps the API’s ranking and numbers the rows', () => {
    renderWithProviders(<CandidateTable candidates={CANDIDATES} />);

    expect(rankedRows().map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'C01',
      'Marcus Okafor (C02)',
      'C05',
      'C03',
    ]);
    expect(within(rankedRows()[3] ?? document.body).getAllByRole('cell')[0]).toHaveTextContent('4');
  });

  it('shows a name only for a shortlisted candidate', () => {
    renderWithProviders(<CandidateTable candidates={CANDIDATES} />);

    expect(screen.getByRole('link', { name: 'Marcus Okafor (C02)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'C01' })).toBeInTheDocument();
    expect(within(rankedRows()[1] ?? document.body).getByText('Shortlisted')).toBeInTheDocument();
  });

  it('shows how many met must-haves are strong, so C03’s 4/4 reads as 0 strong', () => {
    renderWithProviders(<CandidateTable candidates={CANDIDATES} />);

    const c03 = rankedRows()[3] ?? document.body;
    expect(within(c03).getByText(/4\/4 met/)).toHaveTextContent('4/4 met · 0 strong');
    expect(within(c03).getByText('50')).toBeInTheDocument();
  });

  it('lists quarantined candidates in their own section, unscored and out of the ranking', () => {
    renderWithProviders(<CandidateTable candidates={CANDIDATES} />);

    const section = screen.getByRole('region', { name: 'Quarantined' });
    expect(
      within(section)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['C06', 'C07']);
    expect(within(section).getAllByText('Not scored')).toHaveLength(2);
    expect(within(screen.getByRole('table')).queryByText('C06')).not.toBeInTheDocument();
  });

  it('links each candidate to their page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CandidateTable candidates={CANDIDATES} />, {
      url: '/jobs/x',
      path: '/jobs/x',
    });

    await user.click(screen.getByRole('link', { name: 'C05' }));

    expect(screen.getByTestId('location')).toHaveTextContent(`/candidates/${candidateId(5)}`);
  });

  it('explains how to seed when the job has no candidates', () => {
    renderWithProviders(<CandidateTable candidates={[]} />);

    expect(screen.getByText('No candidates yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
