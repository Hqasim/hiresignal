import type { RedactedText } from '../../domain/redaction/redacted-text';
import type { UntrustedText } from '../../domain/shared/untrusted-text';

/**
 * What the wrapped text is, which becomes the tag name (`<untrusted_resume>`). Prompts tell the
 * model that anything inside an `untrusted_*` tag is data, never instructions:
 *
 * - `resume`: a whole redacted resume (the L3 classifier)
 * - `resume_outline`: the context headers of a candidate's chunks (the screening agent's first turn)
 * - `resume_chunk`: one retrieved chunk (agent tool results and the synthesis evidence set)
 */
export type SpotlightLabel = 'resume' | 'resume_outline' | 'resume_chunk';

/**
 * Anything that could open or close an `untrusted_*` wrapper: `<` (optional spaces and `/`) then
 * `untrusted_`. SPEC §9.2 gives `/<\/?\s*untrusted_[a-z_]*\/gi`; this also allows spaces before
 * the slash, as in `< /untrusted_resume>`, which a model may still read as a closing tag.
 */
const WRAPPER_TAG_LIKE = /<\s*\/?\s*untrusted_[a-z_]*/gi;

/**
 * Wraps untrusted text so the model can tell data from instructions (SPEC §9.2, ADR 0013):
 * `<untrusted_${label}>` on its own line, the text, then the closing tag.
 *
 * Any tag-like sequence in the text that could open or close a wrapper has its `<` replaced with
 * `&lt;`, so content can't end its own wrapper early and smuggle text outside it. Everything else
 * stays byte-identical, so citations still match the stored text.
 *
 * Only {@link RedactedText} and {@link UntrustedText} are accepted: a plain string might be an
 * unredacted resume.
 *
 * @example
 * spotlight(redacted, 'resume');
 * // '<untrusted_resume>\n…resume…\n</untrusted_resume>'
 */
export function spotlight(text: RedactedText | UntrustedText, label: SpotlightLabel): string {
  const neutralized = text.replace(WRAPPER_TAG_LIKE, (tag) => `&lt;${tag.slice(1)}`);
  return `<untrusted_${label}>\n${neutralized}\n</untrusted_${label}>`;
}
