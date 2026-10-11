import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { afterEach, describe, expect, it } from 'vitest';

import { CANDIDATES, JOB } from '@/test/fixtures';
import { server } from '@/test/msw-server';
import { aProblem, problemResponse } from '@/test/problems';
import { renderWithProviders } from '@/test/render';

import { JobPage } from './job-page';

function renderJobPage() {
  return renderWithProviders(<JobPage />, {
    url: '/jobs/senior-fullstack-ai',
    path: '/jobs/:slug',
  });
}

afterEach(() => {
  window.localStorage.clear();
});

describe('JobPage', () => {
  it('shows the job, its requirements and the ranked candidates', async () => {
    server.use(
      http.get('*/api/jobs/senior-fullstack-ai', () => HttpResponse.json(JOB)),
      http.get('*/api/jobs/senior-fullstack-ai/candidates', () =>
        HttpResponse.json({ candidates: CANDIDATES }),
      ),
    );

    renderJobPage();

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/Loading/);
    expect(await screen.findByRole('heading', { level: 1, name: JOB.title })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'C01' })).toBeInTheDocument();
    expect(screen.getAllByText('Must-have · weight 3', { exact: false })).toHaveLength(2);
  });

  it('shows the problem detail when the candidates fail to load', async () => {
    server.use(
      http.get('*/api/jobs/senior-fullstack-ai', () => HttpResponse.json(JOB)),
      http.get('*/api/jobs/senior-fullstack-ai/candidates', () =>
        problemResponse(
          aProblem({ status: 404, code: 'NOT_FOUND', detail: 'No job with that slug.' }),
        ),
      ),
    );

    renderJobPage();

    expect(await screen.findByText('No job with that slug.')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load the candidates")).toBeInTheDocument();
  });

  it('remembers that the visitor dismissed the guide', async () => {
    server.use(
      http.get('*/api/jobs/senior-fullstack-ai', () => HttpResponse.json(JOB)),
      http.get('*/api/jobs/senior-fullstack-ai/candidates', () =>
        HttpResponse.json({ candidates: CANDIDATES }),
      ),
    );
    const user = userEvent.setup();
    const first = renderJobPage();

    await user.click(screen.getByRole('button', { name: 'Dismiss the guide' }));
    expect(screen.queryByRole('heading', { name: 'How to explore' })).not.toBeInTheDocument();
    first.unmount();
    renderJobPage();

    expect(screen.queryByRole('heading', { name: 'How to explore' })).not.toBeInTheDocument();
  });
});
