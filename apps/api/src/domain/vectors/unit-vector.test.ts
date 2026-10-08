import { describe, expect, it } from 'vitest';

import { toUnitVector } from './unit-vector';

describe('toUnitVector', () => {
  it.each([
    ['a basis vector', [0, 1, 0]],
    ['a diagonal vector', [Math.SQRT1_2, Math.SQRT1_2]],
    ['a vector with negative components', [-0.6, 0.8]],
  ])('accepts %s whose length is 1', (_label, values) => {
    expect(toUnitVector(values)).toEqual(values);
  });

  it('copies the input, so later changes to the array cannot break the invariant', () => {
    const values = [1, 0];

    const vector = toUnitVector(values);
    values[0] = 5;

    expect(vector).toEqual([1, 0]);
  });

  it.each([
    ['an empty vector', []],
    ['a vector that was never normalized', [3, 4]],
    ['a zero vector', [0, 0, 0]],
    ['a vector containing NaN', [Number.NaN, 1]],
    ['a vector containing Infinity', [Number.POSITIVE_INFINITY, 0]],
  ])('rejects %s', (_label, values) => {
    expect(() => toUnitVector(values)).toThrow(RangeError);
  });
});
