import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { JsonValue } from '../../../application/llm/json-value';

/**
 * Where recorded responses live. Fixtures are opaque JSON here; the recording and replay clients
 * validate their shape.
 */
export interface FixtureStore {
  /** Returns the fixture for `task` and `key`, or `null` if none was recorded. */
  read(task: string, key: string): Promise<unknown>;
  /** Saves a fixture, replacing any previous recording with the same key. */
  write(task: string, key: string, fixture: JsonValue): Promise<void>;
}

/**
 * {@link FixtureStore} on disk: `<directory>/<task>/<key>.json`, committed to git (SPEC §9.8).
 * Fixtures hold only redacted synthetic text, so they're safe to publish.
 *
 * Files are pretty-printed for review, except that arrays of numbers stay on one line, so an
 * embedding is one line instead of 768.
 *
 * @example
 * const store = createFsFixtureStore('apps/api/fixtures/llm');
 */
export function createFsFixtureStore(directory: string): FixtureStore {
  return {
    async read(task: string, key: string): Promise<unknown> {
      let text: string;
      try {
        text = await readFile(join(directory, task, `${key}.json`), 'utf8');
      } catch (error) {
        if (isMissingFile(error)) {
          return null;
        }
        throw error;
      }
      return JSON.parse(text) as unknown;
    },

    async write(task: string, key: string, fixture: JsonValue): Promise<void> {
      await mkdir(join(directory, task), { recursive: true });
      await writeFile(join(directory, task, `${key}.json`), formatFixture(fixture), 'utf8');
    },
  };
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`;
const MULTILINE_NUMBER_ARRAY = new RegExp(String.raw`\[\s+(${NUMBER}(?:,\s+${NUMBER})*)\s+\]`, 'g');

/**
 * Pretty-printed JSON with LF line endings and a final newline, with number arrays collapsed
 * onto one line.
 *
 * @example
 * formatFixture({ values: [0.1, 0.2] }); // '{\n  "values": [0.1, 0.2]\n}\n'
 */
export function formatFixture(fixture: JsonValue): string {
  const pretty = JSON.stringify(fixture, null, 2);
  return `${pretty.replace(MULTILINE_NUMBER_ARRAY, (_match, numbers: string) => `[${numbers.split(/,\s+/).join(', ')}]`)}\n`;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
