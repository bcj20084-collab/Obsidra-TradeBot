export interface CircuitBreakerState {
  active: boolean;
  consecutiveLosses: number;
  reason?: string;
  trippedAt?: Date;
  blockedUntil?: Date;
  remainingCooldownMs?: number;
}

export interface CircuitBreakerOptions {
  lossThreshold?: number;
  lossCooldownMs?: number;
  now?: () => Date;
}

const DEFAULT_LOSS_THRESHOLD = 3;
const DEFAULT_LOSS_COOLDOWN_MS = 6 * 60 * 60_000;

export class CircuitBreaker {
  private active = false;
  private reason: string | undefined;
  private consecutiveLosses = 0;
  private trippedAt: Date | undefined;
  private blockedUntil: Date | undefined;
  private readonly lossThreshold: number;
  private readonly lossCooldownMs: number;
  private readonly now: () => Date;

  constructor(options: CircuitBreakerOptions = {}) {
    this.lossThreshold = options.lossThreshold ?? DEFAULT_LOSS_THRESHOLD;
    this.lossCooldownMs = options.lossCooldownMs ?? DEFAULT_LOSS_COOLDOWN_MS;
    this.now = options.now ?? (() => new Date());
  }

  trip(reason: string, options: { cooldownMs?: number } = {}): void {
    const now = this.now();
    this.active = true;
    this.reason = reason;
    this.trippedAt = now;
    this.blockedUntil = options.cooldownMs === undefined
      ? undefined
      : new Date(now.getTime() + Math.max(0, options.cooldownMs));
  }

  reset(): void {
    this.active = false;
    this.reason = undefined;
    this.consecutiveLosses = 0;
    this.trippedAt = undefined;
    this.blockedUntil = undefined;
  }

  recordTrade(pnlUsdt: number): void {
    if (pnlUsdt >= 0) {
      this.reset();
      return;
    }
    this.consecutiveLosses += 1;
    if (this.consecutiveLosses >= this.lossThreshold) {
      this.trip(`${this.consecutiveLosses} consecutive losses`, { cooldownMs: this.lossCooldownMs });
    }
  }

  get state(): CircuitBreakerState {
    this.recoverIfCooldownExpired();
    const remainingCooldownMs = this.blockedUntil
      ? Math.max(0, this.blockedUntil.getTime() - this.now().getTime())
      : undefined;
    return {
      active: this.active,
      consecutiveLosses: this.consecutiveLosses,
      ...(this.reason ? { reason: this.reason } : {}),
      ...(this.trippedAt ? { trippedAt: this.trippedAt } : {}),
      ...(this.blockedUntil ? { blockedUntil: this.blockedUntil } : {}),
      ...(remainingCooldownMs !== undefined ? { remainingCooldownMs } : {}),
    };
  }

  private recoverIfCooldownExpired(): void {
    if (!this.active || !this.blockedUntil) return;
    if (this.now().getTime() < this.blockedUntil.getTime()) return;
    this.reset();
  }
}
