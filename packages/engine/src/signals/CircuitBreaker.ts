export class CircuitBreaker {
  private active = false;
  private reason = '';
  trip(reason: string) { this.active = true; this.reason = reason; }
  reset() { this.active = false; this.reason = ''; }
  isActive() { return this.active; }
  getReason() { return this.reason; }
}
