import { createMigrationRunner } from '../container';

// `npm run db:migrate`: applies pending db/migrations/*.sql as the schema owner (ADR 0018).
// Locally Node loads `.env` through --env-file-if-exists; CI and the deploy pass the URL directly.
const runner = createMigrationRunner(process.env);

try {
  const result = await runner.run();
  runner.logger.info('db.migrated', {
    applied: result.applied.length,
    skipped: result.skipped.length,
    versions: result.applied.join(',') || null,
  });
} catch (error) {
  runner.logger.error('db.migration_failed', error);
  process.exitCode = 1;
} finally {
  await runner.close();
}
