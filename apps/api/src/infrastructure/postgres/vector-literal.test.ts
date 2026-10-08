import { describe, expect, it } from 'vitest';

import { toUnitVector } from '../../domain/vectors/unit-vector';
import { toVectorLiteral } from './vector-literal';

describe('toVectorLiteral', () => {
  it('formats a vector as a pgvector literal', () => {
    expect(toVectorLiteral(toUnitVector([0.6, -0.8, 0]))).toBe('[0.6,-0.8,0]');
  });

  it('keeps full precision, so the stored vector is the one that was embedded', () => {
    const component = Math.SQRT1_2;

    expect(toVectorLiteral(toUnitVector([component, component]))).toBe(
      `[${String(component)},${String(component)}]`,
    );
  });
});
