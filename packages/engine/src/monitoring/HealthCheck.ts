export type HealthStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export class HealthCheck {
  private status: HealthStatus = 'RUNNING';
  private lastHeartbeatAt = Date.now();

  set(status: HealthStatus) {
    this.status = status;
    this.lastHeartbeatAt = Date.now();
  }

  heartbeat() {
    this.lastHeartbeatAt = Date.now();
  }

  snapshot() {
    return {
      status: this.status,
      ts: new Date().toISOString(),
      lastHeartbeatAt: new Date(this.lastHeartbeatAt).toISOString(),
      stale: Date.now() - this.lastHeartbeatAt > 60_000,
    };
  }
}
