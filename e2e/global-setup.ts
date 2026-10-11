import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Reseeds the local database in replay mode before the local run (never in smoke mode).
 * Shortlisting persists and has no undo, so without this a second run would find C08's name
 * already revealed. Zero model calls: `npm run seed` defaults to replay.
 */
export default function globalSetup(): void {
  execSync('npm run seed -- --reset', { cwd: REPOSITORY_ROOT, stdio: 'inherit' });
}
