import { assertNever } from '../shared/assert-never';
import type { LlmTask, ModelTier } from './llm-task';

/** Which rule picked the tier. Stored as `llm_calls.routed_reason`, so the ops page can explain each call. */
export type RoutingReason = 'default' | 'comparative-intent' | 'candidate-count' | 'context-size';

/** The tier for one call, and why. */
export interface RouteDecision {
  tier: ModelTier;
  reason: RoutingReason;
}

/**
 * Signals a use case passes so the policy can escalate. Only `ask.answer` reads them today; every
 * field is optional because most tasks have none.
 */
export interface RoutingContext {
  /** The recruiter's question, checked for comparative intent. Never logged. */
  question?: string;
  /** Estimated tokens of retrieved context the answer model will read. */
  contextTokens?: number;
  /** How many distinct candidates the retrieved context spans. */
  candidateCount?: number;
}

/**
 * Escalation limits. Passed in rather than imported because `domain/` can't read `config/`;
 * the composition root supplies `ASK_ESCALATION_CONTEXT_TOKENS` and `ASK_ESCALATION_CANDIDATES`.
 */
export interface RoutingThresholds {
  /** Escalate when the context is strictly larger than this many tokens. */
  escalationContextTokens: number;
  /** Escalate when the context spans strictly more candidates than this. */
  escalationCandidates: number;
}

/**
 * Comparative questions need judgment across candidates, so they go to Flash (SPEC §9.1).
 * Word boundaries keep "versatile", "bestseller" and "Frank" from matching.
 */
const COMPARATIVE_INTENT =
  /\b(?:compar(?:e|es|ed|ing|ison|isons)|rank(?:s|ed|ing)?|best|versus|vs|which\s+candidates?)\b/i;

/**
 * Picks the model tier for a task (SPEC §9.1, ADR 0010). Pure and rule-based, so routing is
 * deterministic, free, and testable as a table; no extra LLM call decides it.
 *
 * Only `ask.answer` escalates. Its rules are checked in order, and the first that fires is the
 * reason: comparative intent, then candidate count, then context size.
 *
 * @example
 * routeLlmTask('ask.answer', { question: 'Which candidates know Go?' }, thresholds);
 * // { tier: 'flash', reason: 'comparative-intent' }
 */
export function routeLlmTask(
  task: LlmTask,
  context: RoutingContext,
  thresholds: RoutingThresholds,
): RouteDecision {
  switch (task) {
    case 'guard.classify':
    case 'screen.agent':
    case 'platform.smoke':
      return { tier: 'lite', reason: 'default' };
    case 'screen.synthesize':
    case 'screen.repair':
      return { tier: 'flash', reason: 'default' };
    case 'ask.answer':
      return routeAnswer(context, thresholds);
    default:
      return assertNever(task);
  }
}

function routeAnswer(context: RoutingContext, thresholds: RoutingThresholds): RouteDecision {
  if (context.question !== undefined && COMPARATIVE_INTENT.test(context.question)) {
    return { tier: 'flash', reason: 'comparative-intent' };
  }
  if ((context.candidateCount ?? 0) > thresholds.escalationCandidates) {
    return { tier: 'flash', reason: 'candidate-count' };
  }
  if ((context.contextTokens ?? 0) > thresholds.escalationContextTokens) {
    return { tier: 'flash', reason: 'context-size' };
  }
  return { tier: 'lite', reason: 'default' };
}
