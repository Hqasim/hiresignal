import type { Requirement } from '@hiresignal/contracts';

/** The rubric every candidate is screened against: each line's kind and weight, in words. */
export function RequirementList({ requirements }: { requirements: readonly Requirement[] }) {
  return (
    <section aria-labelledby="requirements-heading" className="space-y-3">
      <h2 id="requirements-heading" className="text-lg font-semibold">
        Requirements
      </h2>
      <ol className="space-y-2 text-sm">
        {requirements.map((requirement) => (
          <li key={requirement.id} className="rounded-lg border px-3 py-2">
            <p>
              <span className="font-medium">{requirement.id}</span> {requirement.text}
            </p>
            <p className="text-xs text-muted-foreground">
              {requirement.kind === 'must' ? 'Must-have' : 'Nice-to-have'} · weight{' '}
              {requirement.weight}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
