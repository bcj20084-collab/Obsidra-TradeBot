import { EmbedBuilder, WebhookClient } from 'discord.js';
import { env } from '../config/env.js';
import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';
import { logger } from '../utils/logger.js';

export class DiscordNotifier {
  private client?: WebhookClient;
  constructor(url?: string) { if (url) this.client = new WebhookClient({ url }); }

  static trades() { return new DiscordNotifier(env.DISCORD_WEBHOOK_TRADES); }
  static alerts() { return new DiscordNotifier(env.DISCORD_WEBHOOK_ALERTS); }
  static daily() { return new DiscordNotifier(env.DISCORD_WEBHOOK_DAILY); }

  async send(content: string) {
    if (!this.client) return;
    try { await this.client.send({ content }); } catch (error) { logger.warn({ module: 'DiscordNotifier', error }, 'send failed'); }
  }

  async tradeOpened(signal: SignalResult, risk: RiskDecision, version = env.BOT_VERSION) {
    if (!this.client) return;
    const embed = new EmbedBuilder()
      .setTitle('Trade opened')
      .setColor(signal.direction === 'LONG' ? 0x16a34a : 0xdc2626)
      .addFields(
        { name: 'Symbol', value: env.TRADING_SYMBOL, inline: true },
        { name: 'Direction', value: signal.direction, inline: true },
        { name: 'Entry', value: String(signal.entryPrice), inline: true },
        { name: 'SL', value: String(risk.stopLossPrice), inline: true },
        { name: 'TP', value: String(risk.takeProfitPrice), inline: true },
        { name: 'Size', value: `${risk.positionSizeUsdt.toFixed(2)} USDT`, inline: true },
        { name: 'Leverage', value: `${risk.leverage}x`, inline: true },
        { name: 'Score', value: String(signal.score), inline: true },
        { name: 'Regime', value: String(signal.indicators.regime ?? 'NORMAL'), inline: true },
      )
      .setFooter({ text: `Obsidra ${version}` })
      .setTimestamp(new Date());
    try { await this.client.send({ embeds: [embed] }); } catch (error) { logger.warn({ module: 'DiscordNotifier', error }, 'trade embed failed'); }
  }

  async dailyReport(input: { pnl: number; trades: number; winRate: number; profitFactor: number; fees: number; drawdown: number }) {
    if (!this.client) return;
    const embed = new EmbedBuilder()
      .setTitle(`Daily report — ${new Date().toISOString().slice(0, 10)}`)
      .setColor(input.pnl >= 0 ? 0x16a34a : 0xdc2626)
      .addFields(
        { name: 'PnL', value: `${input.pnl.toFixed(2)} USDT`, inline: true },
        { name: 'Trades', value: String(input.trades), inline: true },
        { name: 'Win Rate', value: `${input.winRate}%`, inline: true },
        { name: 'Profit Factor', value: String(input.profitFactor), inline: true },
        { name: 'Fees', value: `${input.fees.toFixed(2)} USDT`, inline: true },
        { name: 'Drawdown', value: `${input.drawdown}%`, inline: true },
      )
      .setTimestamp(new Date());
    try { await this.client.send({ embeds: [embed] }); } catch (error) { logger.warn({ module: 'DiscordNotifier', error }, 'daily embed failed'); }
  }
}
