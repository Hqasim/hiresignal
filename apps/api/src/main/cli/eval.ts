import { renderEvalReport, renderGatesSummary } from '../../../evals/eval-report';
import { checkGates } from '../../../evals/gates';
import { NotFoundError } from '../../application/errors';
import { createEvalRunner } from '../container';
import { type EvalArgs, parseEvalArgs } from './eval-args';

// `npm run eval`: the four eval suites of SPEC §14 (retrieval, injection, PII, scorecards) against
// the seeded job and data/evals/, with the thresholds in evals/thresholds.ts. Replay mode (the
// default) is offline and exits 1 when a gate fails, so CI can gate on it. `--mode record` calls
// Gemini only for requests with no fixture yet (in practice, classifier verdicts for new
// injection items), and only Hamzah runs it (CLAUDE.md rule 2). `--write` updates docs/evals.md
// and the gates table in README.md.
// Prints ids, labels and numbers, never eval text.
const args = parseArgsOrExit(process.argv.slice(2));

function parseArgsOrExit(argv: readonly string[]): EvalArgs {
  try {
    return parseEvalArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

const runner = createEvalRunner(process.env, args);
try {
  const { results, calls, date } = await runner.run();
  const gates = checkGates(results);
  const failed = gates.filter((gate) => !gate.passed);
  runner.logger.info('eval.llm_calls', { mode: args.mode, ...calls });
  runner.logger.info('eval.gates', { passed: gates.length - failed.length, failed: failed.length });
  const meta = { date, mode: args.mode };
  const report = renderEvalReport(results, gates, meta);
  const published = await runner.publish({
    report,
    gatesSummary: renderGatesSummary(gates, meta),
  });
  process.stdout.write(
    [
      '',
      report,
      '',
      `Model calls: ${String(calls.attempts)} (live ${String(calls.live)}, fallbacks ${String(calls.fallbacks)}, failed ${String(calls.failed)})`,
      ...(published.documents ? ['Wrote docs/evals.md and the gates table in README.md.'] : []),
      '',
    ].join('\n'),
  );
  if (args.mode === 'record' && calls.fallbacks > 0) {
    // A fallback fixture is saved under the other tier's model, which replay never asks for.
    process.stderr.write(
      'A call fell back to the other tier while recording, so replay will miss its fixture. Run it again: only the missing calls are made.\n',
    );
    process.exitCode = 1;
  } else if (args.mode === 'replay' && failed.length > 0) {
    process.stderr.write(
      `Eval gates failed: ${failed.map((gate) => `${gate.suite} ${gate.metric}`).join('; ')}\n`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    process.stderr.write(`${error.message}\n`);
  }
  runner.logger.error('eval.failed', error);
  process.exitCode = 1;
} finally {
  await runner.close();
}
