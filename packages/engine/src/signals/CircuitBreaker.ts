export class CircuitBreaker {
  private active = false;
  private reason: string | undefined;
  private consecutiveLosses = 0;

  trip(reason: string): void {
    this.active = true;
    this.reason = reason;
  }

  reset(): void {
    this.active = false;
    this.reason = undefined;
  }

  recordTrade(pnlUsdt: number): void {
    this.consecutiveLosses = pnlUsdt < 0 ? this.consecutiveLosses + 1 : 0;
    if (this.consecutiveLosses >= 3) this.trip(`${this.consecutiveLosses} consecutive losses`);
  }

  get state(): { active: boolean; reason?: string; consecutiveLosses: number } {
    return this.reason ? { active: this.active, reason: this.reason, consecutiveLosses: this.consecutiveLosses } : { active: this.active, consecutiveLosses: this.consecutiveLosses };
  }
}
