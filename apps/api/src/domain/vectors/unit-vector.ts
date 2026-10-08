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
 * use {@link normalize} for raw model output.
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

/**
 * Scales an embedding to unit length. Model output goes through this before it is stored or
 * compared, even when the model claims to normalize, so the invariant never depends on a model
 * setting (ADR 0007).
 *
 * @throws RangeError for an empty vector, a non-finite component, or a zero vector (no direction).
 *
 * @example
 * normalize([3, 4]); // [0.6, 0.8]
 */
export function normalize(values: readonly number[]): UnitVector {
  if (values.length === 0) {
    throw new RangeError('Cannot normalize an empty vector');
  }
  if (!values.every(Number.isFinite)) {
    throw new RangeError('Cannot normalize a vector with non-finite components');
  }
  const length = Math.hypot(...values);
  if (length === 0) {
    throw new RangeError('Cannot normalize a zero vector');
  }
  return toUnitVector(values.map((component) => component / length));
}

/**
 * Cosine similarity of two unit vectors, which is their dot product: 1 for the same direction,
 * 0 for orthogonal, −1 for opposite. pgvector's `<=>` returns `1 − cosineSimilarity`.
 *
 * @throws RangeError if the vectors have different dimensions.
 *
 * @example
 * cosineSimilarity(toUnitVector([1, 0]), toUnitVector([0, 1])); // 0
 */
export function cosineSimilarity(a: UnitVector, b: UnitVector): number {
  if (a.length !== b.length) {
    throw new RangeError(
      `Cannot compare vectors of ${String(a.length)} and ${String(b.length)} dimensions`,
    );
  }
  return a.reduce((sum, component, index) => sum + component * (b[index] ?? 0), 0);
}
