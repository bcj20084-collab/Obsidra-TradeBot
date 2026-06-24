export class HealthCheck {
  private status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR' = 'RUNNING';
  set(status: typeof this.status) { this.status = status; }
  snapshot() { return { status: this.status, ts: new Date().toISOString() }; }
}
