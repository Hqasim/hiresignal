import { describe, expect, it } from 'vitest';

import { assertNever } from './assert-never';

describe('assertNever', () => {
  it('throws with the unexpected value when a value escapes its union at runtime', () => {
    const escaped = 'archived' as never;

    expect(() => assertNever(escaped)).toThrow('Unhandled case: "archived"');
  });
});
