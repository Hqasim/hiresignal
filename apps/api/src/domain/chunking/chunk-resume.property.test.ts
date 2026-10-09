import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../candidates/candidate';
import { rehydrateRedactedText } from '../redaction/redacted-text';
import { chunkResume } from './chunk-resume';
import { estimateTokens } from './token-estimate';

/** A fixed seed keeps CI deterministic; change it locally to explore. */
const SEED = 20261009;

const word = fc.stringMatching(/^[A-Za-z][a-z]{0,8}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 12 }).map((words) => words.join(' '));

interface SectionSpec {
  title: string;
  intro: string | null;
  roles: { heading: string; bullets: string[] }[];
}

const role = fc.record({ heading: sentence, bullets: fc.array(sentence, { maxLength: 6 }) });
const section: fc.Arbitrary<SectionSpec> = fc.record({
  title: word,
  intro: fc.option(sentence, { nil: null }),
  roles: fc.array(role, { maxLength: 3 }),
});

/** Builds a resume and tags every bullet with a unique id, so each one can be found again. */
function buildResume(sections: readonly SectionSpec[]) {
  const bulletIds: string[] = [];
  const lines = ['# [PERSON_1]', '[EMAIL_1]', ''];
  sections.forEach((spec, sectionIndex) => {
    lines.push(`## ${spec.title}`, '');
    if (spec.intro !== null) {
      lines.push(spec.intro, '');
    }
    spec.roles.forEach((roleSpec, roleIndex) => {
      lines.push(`### ${roleSpec.heading}`, '');
      roleSpec.bullets.forEach((bullet, bulletIndex) => {
        const id = `b${String(sectionIndex)}x${String(roleIndex)}x${String(bulletIndex)}`;
        bulletIds.push(id);
        lines.push(`- ${id} ${bullet}`);
      });
      lines.push('');
    });
  });
  return { text: lines.join('\n'), bulletIds };
}

const resumeArbitrary = fc.array(section, { minLength: 1, maxLength: 5 }).map(buildResume);
const maxTokensArbitrary = fc.integer({ min: 5, max: 120 });
const alias = CandidateAliasSchema.parse('C01');

describe('chunkResume properties', () => {
  it('produces ordered, non-overlapping chunks that are exact slices of the resume', () => {
    fc.assert(
      fc.property(resumeArbitrary, maxTokensArbitrary, ({ text }, maxTokens) => {
        const chunks = chunkResume(rehydrateRedactedText(text), { alias, maxTokens });
        let previousEnd = 0;
        chunks.forEach((chunk, index) => {
          expect(chunk.ordinal).toBe(index);
          expect(chunk.startOffset).toBeGreaterThanOrEqual(previousEnd);
          expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
          expect(chunk.content.trim()).toBe(chunk.content);
          previousEnd = chunk.endOffset;
        });
      }),
      { seed: SEED },
    );
  });

  it('puts every bullet in exactly one chunk, never split', () => {
    fc.assert(
      fc.property(resumeArbitrary, maxTokensArbitrary, ({ text, bulletIds }, maxTokens) => {
        const chunks = chunkResume(rehydrateRedactedText(text), { alias, maxTokens });
        for (const id of bulletIds) {
          const owners = chunks.filter((chunk) => chunk.content.includes(`- ${id} `));
          expect(owners).toHaveLength(1);
        }
      }),
      { seed: SEED },
    );
  });

  it('stays within the token limit unless a chunk holds a single bullet or paragraph', () => {
    fc.assert(
      fc.property(resumeArbitrary, maxTokensArbitrary, ({ text }, maxTokens) => {
        const chunks = chunkResume(rehydrateRedactedText(text), { alias, maxTokens });
        for (const chunk of chunks) {
          if (estimateTokens(chunk.content) > maxTokens) {
            const blocks = chunk.content
              .split('\n')
              .filter((line) => line.startsWith('- ') || /^[^#\s-]/.test(line));
            expect(blocks.length).toBeLessThanOrEqual(1);
          }
        }
      }),
      { seed: SEED },
    );
  });
});
