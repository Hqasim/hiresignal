import type { JsonValue } from '../../src/application/llm/json-value';
import type { FixtureStore } from '../../src/infrastructure/llm/replay/fixture-store';

/** {@link FixtureStore} fake keyed by `<task>/<key>`, so tests can record and replay in memory. */
export class InMemoryFixtureStore implements FixtureStore {
  readonly fixtures = new Map<string, JsonValue>();

  read(task: string, key: string): Promise<unknown> {
    return Promise.resolve(this.fixtures.get(`${task}/${key}`) ?? null);
  }

  write(task: string, key: string, fixture: JsonValue): Promise<void> {
    this.fixtures.set(`${task}/${key}`, fixture);
    return Promise.resolve();
  }
}
