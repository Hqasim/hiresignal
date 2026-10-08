import type { Embedder } from '../../src/application/ports/embedder';
import type { RedactedText } from '../../src/domain/redaction/redacted-text';
import { normalize, type UnitVector } from '../../src/domain/vectors/unit-vector';

/**
 * {@link Embedder} fake with deterministic vectors: the same text always gets the same unit
 * vector, and different texts almost always differ. Records every call.
 */
export class FakeEmbedder implements Embedder {
  readonly documentBatches: (readonly RedactedText[])[] = [];
  readonly queries: string[] = [];

  constructor(private readonly dimensions = 768) {}

  embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]> {
    this.documentBatches.push(texts);
    return Promise.resolve(texts.map((text) => this.vectorFor(text)));
  }

  embedQuery(text: string): Promise<UnitVector> {
    this.queries.push(text);
    return Promise.resolve(this.vectorFor(text));
  }

  private vectorFor(text: string): UnitVector {
    const values = Array.from({ length: this.dimensions }, (_, index) => {
      const code = text.charCodeAt(index % Math.max(text.length, 1)) || 1;
      return ((code * (index + 1)) % 97) + 1;
    });
    return normalize(values);
  }
}
