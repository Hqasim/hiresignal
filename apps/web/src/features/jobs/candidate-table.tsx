import type { CandidateSummary } from '@hiresignal/contracts';
import { UserCheck } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { GuardBadge } from './guard-badge';
import { MustHaves } from './must-haves';
import { ScoreBar } from './score-bar';

/**
 * A job's candidates in the order the API ranked them (SPEC §10), with quarantined candidates in a
 * section of their own: they were never scored, so they don't belong in the ranking. Names appear
 * only for shortlisted candidates; the API sends `null` otherwise.
 */
export function CandidateTable({ candidates }: { candidates: readonly CandidateSummary[] }) {
  const ranked = candidates.filter((c) => c.guardStatus !== 'quarantined');
  const quarantined = candidates.filter((c) => c.guardStatus === 'quarantined');

  if (candidates.length === 0) {
    return (
      <EmptyState title="No candidates yet">
        Seed the demo data with <code>npm run seed</code>, then reload.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="ranked-heading" className="space-y-3">
        <h2 id="ranked-heading" className="text-lg font-semibold">
          Ranked candidates
        </h2>
        <Table>
          <TableCaption className="sr-only">
            Candidates ranked by score, highest first. Names stay hidden until shortlisted.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Rank</TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Must-haves</TableHead>
              <TableHead>Guard</TableHead>
              <TableHead>Shortlist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((candidate, index) => (
              <TableRow key={candidate.id}>
                <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <CandidateLink candidate={candidate} />
                </TableCell>
                <TableCell>
                  <ScoreBar score={candidate.score} />
                </TableCell>
                <TableCell>
                  <MustHaves mustHaves={candidate.mustHaves} />
                </TableCell>
                <TableCell>
                  <GuardBadge status={candidate.guardStatus} />
                </TableCell>
                <TableCell>
                  <ShortlistState shortlisted={candidate.shortlisted} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {quarantined.length > 0 && (
        <section aria-labelledby="quarantined-heading" className="space-y-3">
          <h2 id="quarantined-heading" className="text-lg font-semibold">
            Quarantined
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            These resumes carry instructions aimed at AI screeners. They were never indexed or
            scored. Open one to see what the guard found.
          </p>
          <ul className="divide-y rounded-lg border">
            {quarantined.map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
              >
                <CandidateLink candidate={candidate} />
                <GuardBadge status={candidate.guardStatus} />
                <span className="text-sm text-muted-foreground">Not scored</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CandidateLink({ candidate }: { candidate: CandidateSummary }) {
  return (
    <Link
      to={`/candidates/${candidate.id}`}
      className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {candidate.displayName === null ? (
        candidate.alias
      ) : (
        <>
          {candidate.displayName} <span className="text-muted-foreground">({candidate.alias})</span>
        </>
      )}
    </Link>
  );
}

function ShortlistState({ shortlisted }: { shortlisted: boolean }) {
  if (!shortlisted) {
    return <span className="text-muted-foreground">–</span>;
  }
  return (
    <span className="flex items-center gap-1">
      <UserCheck aria-hidden className="size-4" />
      Shortlisted
    </span>
  );
}
