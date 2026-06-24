import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';
import { logError } from '../utils/logger.js';
import { DiscordNotifier } from './DiscordNotifier.js';
import { TelegramNotifier } from './TelegramNotifier.js';

export class NotifierHub {
  constructor(
    private readonly telegram = new TelegramNotifier(),
    private readonly tradeDiscord = DiscordNotifier.trades(),
    private readonly alertDiscord = DiscordNotifier.alerts(),
    private readonly dailyDiscord = DiscordNotifier.daily(),
  ) {}

  async tradeOpened(signal: SignalResult, risk: RiskDecision) {
    await this.all([
      this.telegram.send(`✅ Trade deschis\n${signal.direction} ${signal.entryPrice}\nSL ${risk.stopLossPrice}\nTP ${risk.takeProfitPrice}\nScore ${signal.score}`),
      this.tradeDiscord.tradeOpened(signal, risk),
    ]);
  }

  async riskBlocked(reason: string) {
    await this.all([
      this.telegram.send(`⚠️ RiskEngine a blocat trade-ul: ${reason}`),
      this.alertDiscord.send(`Risk blocked: ${reason}`),
    ]);
  }

  async dailyReport(input: { pnl: number; trades: number; winRate: number; profitFactor: number; fees: number; drawdown: number }) {
    await this.all([
      this.telegram.send(`📊 Raport zilnic\nPnL: ${input.pnl} USDT\nTrades: ${input.trades}\nWin rate: ${input.winRate}%`),
      this.dailyDiscord.dailyReport(input),
    ]);
  }

  private async all(tasks: Promise<unknown>[]) {
    const results = await Promise.allSettled(tasks);
    for (const result of results) if (result.status === 'rejected') logError('NotifierHub', result.reason);
  }
}
