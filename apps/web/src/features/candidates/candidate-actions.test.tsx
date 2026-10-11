import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { C01_DETAIL, C01_SCORECARD, C06_DETAIL } from '@/test/fixtures';
import { server } from '@/test/msw-server';
import { problemResponse, QUOTA_PROBLEM } from '@/test/problems';
import { renderWithProviders } from '@/test/render';

import { CandidatePage } from './candidate-page';

function renderCandidate(id: string) {
  return renderWithProviders(<CandidatePage />, {
    url: `/candidates/${id}`,
    path: '/candidates/:id',
  });
}

describe('candidate actions', () => {
  it('reveals the name when the recruiter shortlists the candidate', async () => {
    server.use(
      http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)),
      http.post(`*/api/candidates/${C01_DETAIL.id}/shortlist`, () =>
        HttpResponse.json({ ...C01_DETAIL, displayName: 'Priya Raman', shortlisted: true }),
      ),
    );
    const user = userEvent.setup();
    renderCandidate(C01_DETAIL.id);

    await user.click(await screen.findByRole('button', { name: 'Shortlist and reveal name' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Priya Raman (C01)');
    expect(screen.getByText('Shortlisted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shortlist/ })).not.toBeInTheDocument();
  });

  it('shows the new score after a re-run, read back from the API', async () => {
    let screened = false;
    const rescored = { ...C01_SCORECARD, score: 92 };
    server.use(
      http.get(`*/api/candidates/${C01_DETAIL.id}`, () =>
        HttpResponse.json(
          screened ? { ...C01_DETAIL, score: 92, scorecard: rescored } : C01_DETAIL,
        ),
      ),
      http.post(`*/api/candidates/${C01_DETAIL.id}/screen`, () => {
        screened = true;
        return HttpResponse.json({ scorecard: rescored });
      }),
    );
    const user = userEvent.setup();
    renderCandidate(C01_DETAIL.id);

    await user.click(await screen.findByRole('button', { name: 'Re-run screening' }));

    expect(await screen.findByText('92')).toBeInTheDocument();
    expect(screen.getByText(/Screening finished/)).toBeInTheDocument();
  });

  it('explains the quota when the daily cap refuses a re-run', async () => {
    server.use(
      http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)),
      http.post(`*/api/candidates/${C01_DETAIL.id}/screen`, () => problemResponse(QUOTA_PROBLEM)),
    );
    const user = userEvent.setup();
    renderCandidate(C01_DETAIL.id);

    await user.click(await screen.findByRole('button', { name: 'Re-run screening' }));

    expect(await screen.findByText("Today's model-call quota is used up")).toBeInTheDocument();
    expect(screen.getByText(/Precomputed scorecards/)).toBeInTheDocument();
    // The precomputed scorecard is still on the page.
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('offers no re-run for a quarantined candidate', async () => {
    server.use(http.get(`*/api/candidates/${C06_DETAIL.id}`, () => HttpResponse.json(C06_DETAIL)));
    renderCandidate(C06_DETAIL.id);

    expect(
      await screen.findByRole('button', { name: 'Shortlist and reveal name' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-run screening' })).not.toBeInTheDocument();
  });

  it('expands the agent trace from the keyboard', async () => {
    server.use(http.get(`*/api/candidates/${C01_DETAIL.id}`, () => HttpResponse.json(C01_DETAIL)));
    const user = userEvent.setup();
    renderCandidate(C01_DETAIL.id);
    const trigger = await screen.findByRole('button', { name: 'Agent trace (2 tool calls)' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    expect(screen.getByText('retrieval augmented generation')).toBeInTheDocument();
    expect(screen.getByText('5,400 in · 120 out · 4,100 cached')).toBeInTheDocument();
  });
});
