declare const unitLength: unique symbol;

/**
 * An embedding with Euclidean length 1. On unit vectors, cosine similarity is a dot product, and
 * pgvector's cosine distance `<=>` is `1 − similarity` (ADR 0007).
 */
export type UnitVector = readonly number[] & { readonly [unitLength]: true };

/**
 * How far from 1 a length may be and still count as unit. Float32 embeddings normalized in
 * float64 land within about 1e-7 of 1; anything further off was never normalized.
 */
export const UNIT_LENGTH_TOLERANCE = 1e-6;

/**
 * Checks that `values` is already unit length and brands a copy of it. It doesn't normalize;
 * Phase 2 adds `normalize()` for raw model output.
 *
 * @throws RangeError for an empty vector, a non-finite component, or a length other than 1.
 *
 * @example
 * toUnitVector([0.6, 0.8]); // ok
 * toUnitVector([3, 4]); // RangeError: length 5
 */
export function toUnitVector(values: readonly number[]): UnitVector {
  if (values.length === 0) {
    throw new RangeError('A unit vector needs at least one component');
  }
  if (!values.every(Number.isFinite)) {
    throw new RangeError('A unit vector must have finite components');
  }
  const length = Math.hypot(...values);
  if (Math.abs(length - 1) > UNIT_LENGTH_TOLERANCE) {
    throw new RangeError(`Expected a unit vector, got length ${String(length)}`);
  }
  // The checks above establish the invariant the brand promises.
  return [...values] as unknown as UnitVector;
}
