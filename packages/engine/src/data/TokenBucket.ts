export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  async take(): Promise<void> {
    const queuedAt = Date.now();
    let warned = false;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      if (!warned && Date.now() - queuedAt > 500) warned = true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.lastRefill) / 1_000) * this.refillPerSecond,
    );
    this.lastRefill = now;
  }
}
