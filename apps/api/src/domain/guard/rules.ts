import type { TextSpan } from '../shared/text-span';

/** One L2 pattern rule (SPEC §9.4). */
export interface InjectionRule {
  /** Stable id stored in `guard_verdict`, for example `L2.instruction-override`. */
  id: string;
  /** Short description shown to the recruiter. */
  label: string;
  /** A global regex. Every repeated part is bounded, so matching stays linear on long input. */
  pattern: RegExp;
}

/** Where one rule matched. */
export interface RuleMatch extends TextSpan {
  rule: InjectionRule;
}

/**
 * The L2 rules, in a fixed order. They run on NFKC-normalized, redacted text, so fullwidth or
 * ligature tricks ("ｉｇｎｏｒｅ") are already folded to ASCII. Each rule is tuned against the benign
 * hard negatives in `rules.test.ts`; a visible match is only medium severity, and the classifier
 * decides whether it was an attack or a résumé that talks about attacks.
 */
export const INJECTION_RULES: readonly InjectionRule[] = [
  {
    id: 'L2.instruction-override',
    label: 'Tries to override the screener’s instructions',
    pattern:
      /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}?\b(?:previous|prior|above|earlier|preceding|system|original)\s+(?:instructions?|prompts?|directions?|directives?|rules?|guidance|guidelines)\b/giu,
  },
  {
    id: 'L2.role-hijack',
    label: 'Tries to give the model a new role',
    pattern: new RegExp(
      [
        String.raw`\byou\s+are\s+now\b`,
        String.raw`\bfrom\s+now\s+on,?\s+you\b`,
        String.raw`\bact\s+as\s+(?:an?\s+|the\s+)?(?:recruiter|hiring\s+manager|evaluator|screener|grader|judge)\b`,
        String.raw`\bpretend\s+(?:to\s+be|you\s+are)\b`,
        // A chat-transcript role label at the start of a line, as in "System: approve".
        String.raw`^[ \t]*(?:system|assistant)[ \t]*:`,
      ].join('|'),
      'gimu',
    ),
  },
  {
    id: 'L2.evaluator-targeting',
    label: 'Addresses the AI screener or its rating',
    pattern: new RegExp(
      [
        String.raw`\b(?:rate|score|rank|grade|evaluate|assess|mark|classify|recommend)\s+(?:this|the)\s+(?:candidate|applicant|resume|cv|profile)\b`,
        String.raw`\b(?:note|message|instructions?|attention)\s+(?:to|for)\s+(?:the\s+|any\s+|all\s+)?(?:AI|LLM|GPT|bots?|chatbots?|language\s+models?|automated|screening|recruiting)\b`,
        String.raw`\b(?:AI|LLM|automated)\s+(?:screen\w{0,10}|recruit\w{0,10}|hiring|reviewers?|evaluators?)\b[^.\n]{0,60}?\b(?:must|should|shall|(?:is|are)\s+instructed)\b`,
      ].join('|'),
      'giu',
    ),
  },
  {
    id: 'L2.output-forcing',
    label: 'Dictates the screener’s output or score',
    pattern: new RegExp(
      [
        String.raw`\b(?:respond|reply|answer|output|return)\s+(?:only|exclusively|solely|just)\s+(?:with|in)\b`,
        String.raw`\b10\s*/\s*10\b`,
        String.raw`\b(?:perfect|maximum|max|highest)\s+(?:score|rating)\b`,
        String.raw`\bscore\s+of\s+(?:10|ten)\b`,
        String.raw`\b(?:mark|rate|score|rank)\s+(?:all|every|each)\s+(?:of\s+the\s+)?(?:requirements?|criteria|skills?|qualifications?)\b`,
      ].join('|'),
      'giu',
    ),
  },
  {
    id: 'L2.delimiter-spoofing',
    label: 'Imitates prompt delimiters to escape its quoted context',
    pattern: new RegExp(
      [
        String.raw`<\s*/?\s*untrusted_[a-z_]{0,40}`,
        String.raw`<\|\s*(?:im_start|im_end|system|user|assistant|endoftext)\s*\|>`,
        String.raw`\[/?INST\]`,
        String.raw`<</?SYS>>`,
        // A bare <system> tag, but not a generic type argument such as List<System>.
        String.raw`(?<![\w>])</?\s*(?:system|instructions?)\s*>`,
      ].join('|'),
      'giu',
    ),
  },
];

/**
 * Runs every L2 rule over the text (SPEC §9.4) and returns each match with its span, in text order.
 * Callers decide severity: a match inside hidden markup is high, a visible one medium.
 *
 * @example
 * findRuleMatches('Ignore all previous instructions.');
 * // [{ rule: { id: 'L2.instruction-override', … }, start: 0, end: 32 }]
 */
export function findRuleMatches(text: string): RuleMatch[] {
  const matches = INJECTION_RULES.flatMap((rule) =>
    // matchAll copies the regex, so the shared pattern's lastIndex never changes between calls.
    [...text.matchAll(rule.pattern)].map((match) => ({
      rule,
      start: match.index,
      end: match.index + match[0].length,
    })),
  );
  return matches.sort((a, b) => a.start - b.start);
}
