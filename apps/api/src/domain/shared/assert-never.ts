/**
 * Marks a branch the type checker has proven unreachable, so every `switch` over a
 * string-literal union stays exhaustive: adding a member without handling it is a compile error.
 *
 * @throws Error if reached at runtime, which means a value escaped its type (for example, unvalidated input).
 *
 * @example
 * function label(status: 'clean' | 'flagged'): string {
 *   switch (status) {
 *     case 'clean':
 *       return 'Clean';
 *     case 'flagged':
 *       return 'Flagged';
 *     default:
 *       return assertNever(status);
 *   }
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
