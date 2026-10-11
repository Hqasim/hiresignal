import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { C01_DETAIL, C06_DETAIL } from '@/test/fixtures';
import { server } from '@/test/msw-server';
import { aProblem, problemResponse } from '@/test/problems';
import { renderWithProviders } from '@/test/render';

import { CandidatePage } from './candidate-page';

function renderCandidate(id: string, search = '') {
  return renderWithProviders(<CandidatePage />, {
    url: `/candidates/${id}${search}`,
    path: '/candidates/:id',
  });
}

describe('CandidatePage', () => {
  it('highlights a citation in the resume when its chip is clicked', async () => {
    server.use(http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)));
    const user = userEvent.setup();
    renderCandidate(C01_DETAIL.id);

    await user.click(await screen.findByRole('button', { name: /Built the TypeScript and React/ }));

    const resume = screen.getByRole('region', { name: 'Redacted resume' });
    const active = within(resume)
      .getByText('Built the TypeScript and React dashboard that 300 analysts use daily.')
      .closest('mark');
    expect(active).toHaveAttribute('data-active', 'true');
    expect(active).toHaveFocus();
    expect(within(resume).getByText('[EMAIL_1]')).toBeInTheDocument();
  });

  it('lets a keyboard user focus the scrolling resume pane, so it scrolls without a mouse', async () => {
    server.use(http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)));
    renderCandidate(C01_DETAIL.id);

    const resume = await screen.findByRole('region', { name: 'Redacted resume' });
    resume.focus();

    expect(resume).toHaveFocus();
  });

  it('opens with the quote from ?cite= highlighted', async () => {
    server.use(http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)));
    const span = C01_DETAIL.scorecard?.requirements[1]?.citations[0]?.span;

    renderCandidate(C01_DETAIL.id, `?cite=${String(span?.start)}-${String(span?.end)}`);

    const resume = await screen.findByRole('region', { name: 'Redacted resume' });
    const quote = within(resume).getByText('Shipped a retrieval-augmented assistant');
    expect(quote.closest('mark')).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /Shipped a retrieval-augmented/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a quarantined candidate’s hidden instruction in red with its layers, and no score', async () => {
    server.use(http.get(`*/api/candidates/${C06_DETAIL.id}`, () => HttpResponse.json(C06_DETAIL)));
    renderCandidate(C06_DETAIL.id);

    expect(await screen.findByText('Injection (L1, L2)')).toBeInTheDocument();
    expect(screen.getByText('No score: quarantined resumes are never scored.')).toBeInTheDocument();
    const guard = screen.getByRole('region', { name: 'Injection guard' });
    expect(
      within(guard).getByText('Text hidden in an HTML comment', { exact: false }),
    ).toBeInTheDocument();
    expect(within(guard).getByText(/Classifier skipped/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scorecard' })).toHaveTextContent('No score');
  });

  it('shows the problem detail for an unknown candidate', async () => {
    server.use(
      http.get('*/api/candidates/*', () =>
        problemResponse(
          aProblem({ status: 404, code: 'NOT_FOUND', detail: 'No candidate with that id.' }),
        ),
      ),
    );
    renderCandidate(C01_DETAIL.id);

    expect(await screen.findByText('No candidate with that id.')).toBeInTheDocument();
  });
});
