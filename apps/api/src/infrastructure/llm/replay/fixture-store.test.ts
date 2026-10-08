import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFsFixtureStore, formatFixture } from './fixture-store';

describe('formatFixture', () => {
  it('pretty-prints objects but keeps number arrays on one line', () => {
    expect(formatFixture({ vectors: [[0.1, -0.2, 3e-7]], text: 'ok', tags: ['a', 'b'] })).toBe(
      '{\n  "vectors": [\n    [0.1, -0.2, 3e-7]\n  ],\n  "text": "ok",\n  "tags": [\n    "a",\n    "b"\n  ]\n}\n',
    );
  });
});

describe('createFsFixtureStore', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hiresignal-fixtures-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes <task>/<key>.json and reads it back', async () => {
    const store = createFsFixtureStore(directory);

    await store.write('platform.smoke', 'abc', { kind: 'generate', values: [1, 2] });

    await expect(store.read('platform.smoke', 'abc')).resolves.toEqual({
      kind: 'generate',
      values: [1, 2],
    });
    await expect(readFile(join(directory, 'platform.smoke', 'abc.json'), 'utf8')).resolves.toBe(
      '{\n  "kind": "generate",\n  "values": [1, 2]\n}\n',
    );
  });

  it('returns null for a fixture that was never recorded', async () => {
    await expect(createFsFixtureStore(directory).read('ask.answer', 'missing')).resolves.toBeNull();
  });
});
