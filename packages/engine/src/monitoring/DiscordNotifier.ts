import { WebhookClient, EmbedBuilder } from "discord.js";
import type { LiveMetrics, SignalResult } from "@obsidra/shared";

export class DiscordNotifier {
  private readonly trades?: WebhookClient;
  private readonly alerts?: WebhookClient;
  private readonly dailyHook?: WebhookClient;

  constructor(tradesUrl: string, alertsUrl: string, dailyUrl: string) {
    if (tradesUrl) this.trades = new WebhookClient({ url: tradesUrl });
    if (alertsUrl) this.alerts = new WebhookClient({ url: alertsUrl });
    if (dailyUrl) this.dailyHook = new WebhookClient({ url: dailyUrl });
  }

  async tradeOpened(symbol: string, signal: SignalResult, size: number, leverage: number): Promise<void> {
    if (!this.trades) return;
    const embed = new EmbedBuilder()
      .setTitle("Trade opened")
      .setColor(signal.direction === "LONG" ? 0x22c55e : 0xef4444)
      .addFields(
        { name: "Symbol", value: symbol, inline: true },
        { name: "Direction", value: signal.direction, inline: true },
        { name: "Entry", value: signal.entryPrice.toFixed(2), inline: true },
        { name: "SL / TP", value: `${signal.stopLoss.toFixed(2)} / ${signal.takeProfit.toFixed(2)}` },
        { name: "Size", value: `${size.toFixed(2)} USDT`, inline: true },
        { name: "Leverage", value: `${leverage}x`, inline: true },
        { name: "Score", value: String(signal.score), inline: true },
        { name: "Regime", value: signal.regime, inline: true },
      )
      .setFooter({ text: `Obsidra v${process.env.npm_package_version ?? "0.1.0"}` })
      .setTimestamp();
    await this.trades.send({ embeds: [embed] });
  }

  async alert(message: string): Promise<void> {
    await this.alerts?.send({ embeds: [new EmbedBuilder().setTitle("Risk alert").setDescription(message).setColor(0xef4444).setTimestamp()] });
  }

  async daily(metrics: LiveMetrics): Promise<void> {
    if (!this.dailyHook) return;
    await this.dailyHook.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`📊 Raport zilnic — ${new Date().toISOString().slice(0, 10)}`)
          .setColor(metrics.totalPnlUsdt >= 0 ? 0x22c55e : 0xef4444)
          .addFields(
            { name: "PnL", value: `${metrics.totalPnlUsdt.toFixed(2)} USDT`, inline: true },
            { name: "Trades", value: String(metrics.totalTrades), inline: true },
            { name: "Win Rate", value: `${metrics.winRate.toFixed(1)}%`, inline: true },
            { name: "Profit Factor", value: metrics.profitFactor.toFixed(2), inline: true },
            { name: "Fees", value: metrics.totalFeesPaidUsdt.toFixed(2), inline: true },
            { name: "Drawdown", value: `${metrics.currentDrawdown.toFixed(2)}%`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  }
}
