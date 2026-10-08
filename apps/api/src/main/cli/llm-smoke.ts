import { createLlmSmokeRunner } from '../container';

// `npm run llm:smoke`: one structured generation per tier and one embedding against live Gemini,
// recorded as fixtures under apps/api/fixtures/llm (SPEC §20 Phase 2). Hamzah runs it by hand;
// tests and CI never do (CLAUDE.md rule 2). Logs metadata only, never prompts or model output.
const runner = createLlmSmokeRunner(process.env);

try {
  const report = await runner.run();
  for (const generation of report.generations) {
    runner.logger.info('llm.smoke_generation', { ...generation });
  }
  runner.logger.info('llm.smoke_embedding', report.embedding);
  runner.logger.info('llm.smoke_passed', {
    generations: report.generations.length,
    embeddingDimensions: report.embedding.dimensions,
  });
} catch (error) {
  runner.logger.error('llm.smoke_failed', error);
  process.exitCode = 1;
}
