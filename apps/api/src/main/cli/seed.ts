import { formatOutcomeTable } from '../../application/ingest/outcome-table';
import { createSeedRunner } from '../container';
import { parseSeedArgs, type SeedArgs } from './seed-args';

// `npm run seed`: loads the demo job and its ten resumes through ingestion (SPEC §9.5, §20
// Phase 4). Replay mode (the default) reads recorded fixtures and needs no key; `seed:record`
// (`--mode record --reset`) calls Gemini and records them, and only Hamzah runs it (CLAUDE.md
// rule 2). Logs metadata only; the final table holds aliases, statuses and counts, never text.
const args = parseArgsOrExit(process.argv.slice(2));

function parseArgsOrExit(argv: readonly string[]): SeedArgs {
  try {
    return parseSeedArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

const runner = createSeedRunner(process.env, args);
try {
  const { result, calls } = await runner.run();
  runner.logger.info('seed.llm_calls', { mode: args.mode, ...calls });
  process.stdout.write(
    [
      '',
      formatOutcomeTable(result.outcomes),
      '',
      `Model calls: ${String(calls.attempts)} (live ${String(calls.live)}, fallbacks ${String(calls.fallbacks)}, failed ${String(calls.failed)})`,
      '',
    ].join('\n'),
  );
  if (args.mode === 'record' && calls.fallbacks > 0) {
    // A fallback fixture is saved under the other tier's model, which replay never asks for.
    process.stderr.write(
      'A call fell back to the other tier while recording, so replay will miss its fixture. Run npm run seed:record again.\n',
    );
    process.exitCode = 1;
  }
} catch (error) {
  runner.logger.error('seed.failed', error);
  process.exitCode = 1;
} finally {
  await runner.close();
}
