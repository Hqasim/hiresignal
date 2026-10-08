import { describe, expect, it } from 'vitest';

import type { LlmTask } from './llm-task';
import { routeLlmTask, type RoutingContext, type RoutingThresholds } from './policy';

const thresholds: RoutingThresholds = { escalationContextTokens: 3000, escalationCandidates: 3 };

describe('routeLlmTask', () => {
  it.each<[LlmTask, 'lite' | 'flash']>([
    ['guard.classify', 'lite'],
    ['screen.agent', 'lite'],
    ['screen.synthesize', 'flash'],
    ['screen.repair', 'flash'],
    ['ask.answer', 'lite'],
    ['platform.smoke', 'lite'],
  ])('sends %s to its default tier (%s)', (task, tier) => {
    expect(routeLlmTask(task, {}, thresholds)).toEqual({ tier, reason: 'default' });
  });

  describe('for ask.answer', () => {
    it.each([
      'Compare the backend experience of C01 and C02',
      'Which candidates have led a team?',
      'Who is the best fit for on-call work?',
      'Rank everyone by Postgres depth',
      'Is C04 stronger versus C05 on testing?',
      'C01 vs C03 on AWS',
      'Give me a comparison of their cloud work',
      'COMPARING TYPESCRIPT SKILLS',
    ])('escalates to flash for the comparative question "%s"', (question) => {
      expect(routeLlmTask('ask.answer', { question }, thresholds)).toEqual({
        tier: 'flash',
        reason: 'comparative-intent',
      });
    });

    it.each([
      'Who has versatile frontend skills?',
      'Has anyone written a bestseller?',
      'Did Frank ship anything in Go?',
      'Who has worked with Kubernetes?',
    ])('keeps the non-comparative question "%s" on lite', (question) => {
      expect(routeLlmTask('ask.answer', { question }, thresholds)).toEqual({
        tier: 'lite',
        reason: 'default',
      });
    });

    it.each<[string, RoutingContext, 'lite' | 'flash', string]>([
      ['more candidates than the threshold', { candidateCount: 4 }, 'flash', 'candidate-count'],
      ['exactly the candidate threshold', { candidateCount: 3 }, 'lite', 'default'],
      ['more context than the threshold', { contextTokens: 3001 }, 'flash', 'context-size'],
      ['exactly the context threshold', { contextTokens: 3000 }, 'lite', 'default'],
    ])('routes a context with %s to %s', (_label, context, tier, reason) => {
      expect(routeLlmTask('ask.answer', context, thresholds)).toEqual({ tier, reason });
    });

    it('reports comparative intent first when several rules fire', () => {
      const context = { question: 'Rank them', candidateCount: 9, contextTokens: 9000 };

      expect(routeLlmTask('ask.answer', context, thresholds).reason).toBe('comparative-intent');
    });

    it('reports candidate count before context size', () => {
      const context = { candidateCount: 9, contextTokens: 9000 };

      expect(routeLlmTask('ask.answer', context, thresholds).reason).toBe('candidate-count');
    });
  });

  it('ignores escalation signals on tasks that never escalate', () => {
    const context = { question: 'Compare everyone', candidateCount: 9, contextTokens: 9000 };

    expect(routeLlmTask('screen.agent', context, thresholds)).toEqual({
      tier: 'lite',
      reason: 'default',
    });
  });
});
