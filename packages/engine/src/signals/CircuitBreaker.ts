export class CircuitBreaker {
  private active = false;
  private reason: string | undefined;

  trip(reason: string): void {
    this.active = true;
    this.reason = reason;
  }

  reset(): void {
    this.active = false;
    this.reason = undefined;
  }

  get state(): { active: boolean; reason?: string } {
    return this.reason ? { active: this.active, reason: this.reason } : { active: this.active };
  }
}
