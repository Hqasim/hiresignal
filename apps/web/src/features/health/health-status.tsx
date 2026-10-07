import { useHealth } from './api';
import { HealthStatusView, type HealthViewState } from './health-status-view';

/** Health card wired to `GET /api/health`. */
export function HealthStatus() {
  const query = useHealth();

  let state: HealthViewState;
  if (query.isPending) {
    state = { kind: 'loading' };
  } else if (query.isError) {
    state = { kind: 'error', detail: query.error.message };
  } else {
    state = { kind: 'ready', health: query.data };
  }

  return <HealthStatusView state={state} />;
}
