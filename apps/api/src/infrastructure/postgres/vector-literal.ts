import type { UnitVector } from '../../domain/vectors/unit-vector';

/**
 * Formats a vector as a pgvector text literal, `[0.1,0.2,…]`, to pass as a query parameter and
 * cast with `::vector`. JavaScript prints each number in its shortest round-trip form, which
 * pgvector parses back exactly.
 *
 * @example
 * toVectorLiteral(toUnitVector([0.6, 0.8])); // '[0.6,0.8]'
 */
export function toVectorLiteral(vector: UnitVector): string {
  return `[${vector.join(',')}]`;
}
