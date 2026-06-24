export class DailyLossGuard {
  constructor(private readonly limitUsdt: number) {}
  check(realizedPnlToday: number) { return realizedPnlToday <= -Math.abs(this.limitUsdt) ? { ok: false, reason: `Daily loss limit reached: ${realizedPnlToday}` } : { ok: true as const }; }
}
