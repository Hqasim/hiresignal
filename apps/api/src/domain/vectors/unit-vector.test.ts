import { describe, expect, it } from 'vitest';

import { cosineSimilarity, normalize, toUnitVector } from './unit-vector';

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

describe('normalize', () => {
  it('scales a raw embedding to unit length', () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
  });

  it('leaves a vector that is already unit length unchanged', () => {
    expect(normalize([0, 1, 0])).toEqual([0, 1, 0]);
  });

  it('gives the same direction for any positive scale', () => {
    const small = normalize([1, 2, 2]);
    const large = normalize([100, 200, 200]);

    small.forEach((component, index) => {
      expect(component).toBeCloseTo(large[index] ?? Number.NaN, 12);
    });
  });

  it.each([
    ['an empty vector', []],
    ['a zero vector, which has no direction', [0, 0, 0]],
    ['a vector containing NaN', [Number.NaN, 1]],
    ['a vector containing Infinity', [Number.NEGATIVE_INFINITY, 1]],
  ])('rejects %s', (_label, values) => {
    expect(() => normalize(values)).toThrow(RangeError);
  });
});

describe('cosineSimilarity', () => {
  it.each([
    ['identical vectors', [0.6, 0.8], [0.6, 0.8], 1],
    ['orthogonal vectors', [1, 0], [0, 1], 0],
    ['opposite vectors', [1, 0], [-1, 0], -1],
    ['vectors 60 degrees apart', [1, 0], [0.5, Math.sqrt(3) / 2], 0.5],
  ])('is the dot product for %s', (_label, a, b, expected) => {
    expect(cosineSimilarity(toUnitVector(a), toUnitVector(b))).toBeCloseTo(expected, 12);
  });

  it('rejects vectors of different dimensions instead of comparing a prefix', () => {
    expect(() => cosineSimilarity(toUnitVector([1, 0]), toUnitVector([1, 0, 0]))).toThrow(
      RangeError,
    );
  });
});
