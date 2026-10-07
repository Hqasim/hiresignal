import type { HealthResponse, Problem } from '@hiresignal/contracts';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw-server';
import { renderWithQueryClient } from '@/test/render';

import { HealthStatus } from './health-status';

const healthy: HealthResponse = {
  status: 'ok',
  db: 'unchecked',
  llmMode: 'replay',
  gitSha: 'abc1234def',
};

describe('HealthStatus', () => {
  it('shows "API: healthy" with the build and LLM mode once the API answers', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json(healthy)));

    renderWithQueryClient(<HealthStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking API…');
    expect(await screen.findByText('API: healthy')).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('replay')).toBeInTheDocument();
  });

  it('shows the problem detail when the API answers with problem+json', async () => {
    const problem: Problem = {
      type: 'urn:hiresignal:problem:internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Something went wrong on our side. Quote the request id if you report it.',
      instance: '/api/health',
      code: 'INTERNAL_ERROR',
      requestId: 'req-1',
    };
    server.use(
      http.get('*/api/health', () =>
        HttpResponse.json(problem, {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('API: unreachable')).toBeInTheDocument();
    expect(screen.getByText(problem.detail)).toBeInTheDocument();
  });

  it('treats a response that breaks the contract as an error, not as healthy', async () => {
    server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));

    renderWithQueryClient(<HealthStatus />);

    expect(await screen.findByText('API: unreachable')).toBeInTheDocument();
    expect(screen.getByText('The API returned data in an unexpected shape.')).toBeInTheDocument();
  });
});
