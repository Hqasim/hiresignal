import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readJsonl } from './jsonl';

const ItemSchema = z.strictObject({ id: z.string().min(2), count: z.number() });

describe('readJsonl', () => {
  let directory = '';
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'jsonl-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function write(name: string, content: string): Promise<string> {
    const file = join(directory, name);
    await writeFile(file, content);
    return file;
  }

  it('parses every line in order and skips blank lines', async () => {
    const file = await write('ok.jsonl', '{"id":"a1","count":1}\n\n{"id":"b2","count":2}\n');

    await expect(readJsonl(file, ItemSchema)).resolves.toEqual([
      { id: 'a1', count: 1 },
      { id: 'b2', count: 2 },
    ]);
  });

  it('names the line and the fields that fail validation', async () => {
    const file = await write('bad.jsonl', '{"id":"a1","count":1}\n{"id":"b","count":"2"}\n');

    await expect(readJsonl(file, ItemSchema)).rejects.toThrow(/bad\.jsonl:2: invalid id, count/);
  });

  it('rejects a line that is not JSON', async () => {
    const file = await write('text.jsonl', 'not json\n');

    await expect(readJsonl(file, ItemSchema)).rejects.toThrow(/text\.jsonl:1: invalid \(root\)/);
  });
});
