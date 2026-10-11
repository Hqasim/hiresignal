import type { LlmCallListResponse, LlmCallStats, OpsSummary } from '@hiresignal/contracts';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { OpsPage } from './ops-page';

const STATS: LlmCallStats = {
  calls: 12,
  live: 8,
  replay: 4,
  errors: 1,
  fallbacks: 2,
  inputTokens: 170447,
  outputTokens: 4100,
  cachedTokens: 93166,
  cacheRatio: 0.5466,
  p50LatencyMs: 250,
  p95LatencyMs: 775,
};

const SUMMARY: OpsSummary = {
  day: '2026-10-12',
  generatedAt: '2026-10-12T14:05:00.000Z',
  cap: { used: 8, limit: 300, resetsAt: '2026-10-13T00:00:00.000Z' },
  totals: STATS,
  byModel: [{ ...STATS, model: 'gemini-3.5-flash-lite', tier: 'lite' }],
  routeMix: [{ tier: 'lite', routedReason: 'default', calls: 9 }],
};

const CALLS: LlmCallListResponse = {
  calls: [
    {
      id: 7,
      requestId: 'req-1',
      task: 'ask.answer',
      model: 'gemini-3.5-flash',
      tier: 'flash',
      routedReason: 'comparative-intent',
      isFallback: false,
      source: 'replay',
      status: 'rate_limited',
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      latencyMs: 0,
      promptVersion: 'ask@1',
      createdAt: '2026-10-12T13:59:00.000Z',
    },
  ],
};

function serve(summary: OpsSummary, calls: LlmCallListResponse) {
  server.use(
    http.get('*/api/ops/summary', () => HttpResponse.json(summary)),
    http.get('*/api/ops/calls', ({ request }) =>
      new URL(request.url).searchParams.get('limit') === '50'
        ? HttpResponse.json(calls)
        : HttpResponse.json({ calls: [] }),
    ),
  );
}

describe('OpsPage', () => {
  it('shows calls against the cap, the cache ratio, p95 latency and fallbacks', async () => {
    serve(SUMMARY, CALLS);
    renderWithProviders(<OpsPage />);

    const tile = async (label: string) =>
      (await screen.findByText(label, { selector: 'dt' })).closest('div') ?? document.body;
    expect(await tile('Live calls today')).toHaveTextContent('8 / 300');
    expect(await tile('Live calls today')).toHaveTextContent('resets at 00:00 UTC');
    expect(await tile('Cache hit ratio')).toHaveTextContent('54.7%');
    expect(await tile('p95 latency')).toHaveTextContent('775 ms');
    expect(await tile('Fallbacks')).toHaveTextContent('2');
  });

  it('lists the route mix, the per-model numbers and recent calls in words', async () => {
    serve(SUMMARY, CALLS);
    renderWithProviders(<OpsPage />);

    const routes = await screen.findByRole('region', { name: 'Route mix' });
    expect(within(routes).getByText('default')).toBeInTheDocument();
    const models = screen.getByRole('region', { name: 'By model' });
    expect(within(models).getByText('gemini-3.5-flash-lite')).toBeInTheDocument();
    const calls = await screen.findByRole('region', { name: 'Recent calls' });
    expect(within(calls).getByText('rate limited')).toBeInTheDocument();
    expect(within(calls).getByText('replay')).toBeInTheDocument();
    expect(within(calls).getByText('– / – / –')).toBeInTheDocument();
  });

  it('explains empty numbers on a day without live calls', async () => {
    const quiet: LlmCallStats = {
      ...STATS,
      calls: 0,
      live: 0,
      replay: 0,
      errors: 0,
      fallbacks: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cacheRatio: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
    };
    serve(
      { ...SUMMARY, cap: { ...SUMMARY.cap, used: 0 }, totals: quiet, byModel: [], routeMix: [] },
      { calls: [] },
    );
    renderWithProviders(<OpsPage />);

    expect(
      await screen.findByText('No live calls today, so no token usage to measure.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No model calls today')).toBeInTheDocument();
    expect(await screen.findByText('No model calls recorded yet')).toBeInTheDocument();
  });
});
