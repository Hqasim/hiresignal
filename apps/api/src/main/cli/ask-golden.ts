import { formatGoldenReport } from '../../../evals/golden-report';
import { NotFoundError } from '../../application/errors';
import { ASK_KEYWORD_MATCH, SIMILARITY_FLOOR } from '../../config/ai';
import { toGoldenRun } from '../ask-wiring';
import { createAskGoldenRunner } from '../container';
import { type AskGoldenArgs, parseAskGoldenArgs } from './ask-golden-args';

// `npm run ask:golden`: asks the seeded job every question in data/evals/retrieval.jsonl (SPEC §12)
// and prints recall@5 and MRR for each keyword-match mode, where the similarity floor falls, and
// how each ask ended (SPEC §20 Phase 6). Replay mode (the default) is offline. `--mode record`
// calls Gemini only for requests with no fixture yet, and only Hamzah runs it (CLAUDE.md rule 2);
// `--retrieval-only` skips the answer call, so it records just the question embeddings. Prints ids,
// aliases and numbers, never question or answer text.
const RECALL_AT = 5;
const args = parseArgsOrExit(process.argv.slice(2));

function parseArgsOrExit(argv: readonly string[]): AskGoldenArgs {
  try {
    return parseAskGoldenArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

const runner = createAskGoldenRunner(process.env, args);
try {
  const { runs, calls } = await runner.run();
  runner.logger.info('ask_golden.llm_calls', { mode: args.mode, ...calls });
  process.stdout.write(
    [
      '',
      formatGoldenReport(runs.map(toGoldenRun), {
        k: RECALL_AT,
        keywordMatch: ASK_KEYWORD_MATCH,
        similarityFloor: SIMILARITY_FLOOR,
      }),
      '',
      `Model calls: ${String(calls.attempts)} (live ${String(calls.live)}, fallbacks ${String(calls.fallbacks)}, failed ${String(calls.failed)})`,
      '',
    ].join('\n'),
  );
  if (args.mode === 'record' && calls.fallbacks > 0) {
    // A fallback fixture is saved under the other tier's model, which replay never asks for.
    process.stderr.write(
      'A call fell back to the other tier while recording, so replay will miss its fixture. Run it again: only the missing calls are made.\n',
    );
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    process.stderr.write('The demo job is not seeded. Run npm run seed first.\n');
  }
  runner.logger.error('ask_golden.failed', error);
  process.exitCode = 1;
} finally {
  await runner.close();
}
