import type { RedactionCount } from '@hiresignal/contracts';

import type { RedactionType } from './highlight';

const TYPE_LABELS: Record<RedactionType, [singular: string, plural: string]> = {
  PERSON: ['name', 'names'],
  EMAIL: ['email address', 'email addresses'],
  PHONE: ['phone number', 'phone numbers'],
  URL: ['link', 'links'],
  ADDRESS: ['street address', 'street addresses'],
  SCHOOL: ['school', 'schools'],
  GRAD_YEAR: ['graduation year', 'graduation years'],
};

/** What redaction removed before any model saw the resume (SPEC §9.3), as counts of distinct values. */
export function RedactionSummary({ counts }: { counts: readonly RedactionCount[] }) {
  return (
    <section aria-labelledby="redaction-heading" className="space-y-1 text-sm">
      <h2 id="redaction-heading" className="font-semibold">
        Redacted before screening
      </h2>
      {counts.length === 0 ? (
        <p className="text-muted-foreground">Nothing: no PII was found.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {counts.map(({ type, count }) => {
            const [singular, plural] = TYPE_LABELS[type];
            return (
              <li key={type}>
                {count} {count === 1 ? singular : plural}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
