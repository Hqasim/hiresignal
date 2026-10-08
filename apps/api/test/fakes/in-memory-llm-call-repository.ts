import type {
  LlmCallRecord,
  LlmCallRepository,
} from '../../src/application/ports/llm-call-repository';

/** {@link LlmCallRepository} fake that keeps rows in memory, or fails when `failure` is set. */
export class InMemoryLlmCallRepository implements LlmCallRepository {
  readonly rows: LlmCallRecord[] = [];
  failure: Error | null = null;

  record(call: LlmCallRecord): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.rows.push(call);
    return Promise.resolve();
  }

  countLiveSince(since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => row.source === 'live' && row.createdAt >= since).length,
    );
  }
}
