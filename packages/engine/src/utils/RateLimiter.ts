export class RateLimiter {
  private available: number;
  private lastRefillAt = Date.now();

  constructor(private readonly max: number, private readonly refillPerSecond: number) {
    this.available = max;
  }

  async wait(cost = 1) {
    while (!this.tryUse(cost)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  tryUse(cost = 1) {
    this.refill();
    if (this.available < cost) return false;
    this.available -= cost;
    return true;
  }

  private refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillAt) / 1000;
    this.available = Math.min(this.max, this.available + elapsedSeconds * this.refillPerSecond);
    this.lastRefillAt = now;
  }
}
