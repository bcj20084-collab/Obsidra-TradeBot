import type { LiveMetrics, SignalResult } from "@obsidra/shared";

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp: string;
}

export class DiscordNotifier {
  constructor(
    private readonly tradesUrl: string,
    private readonly alertsUrl: string,
    private readonly dailyUrl: string,
  ) {}

  async tradeOpened(symbol: string, signal: SignalResult, size: number, leverage: number): Promise<void> {
    await this.send(this.tradesUrl, {
      title: "Trade opened",
      color: signal.direction === "LONG" ? 0x22c55e : 0xef4444,
      fields: [
        { name: "Symbol", value: symbol, inline: true },
        { name: "Direction", value: signal.direction, inline: true },
        { name: "Entry", value: signal.entryPrice.toFixed(2), inline: true },
        { name: "SL / TP", value: `${signal.stopLoss.toFixed(2)} / ${signal.takeProfit.toFixed(2)}` },
        { name: "Size", value: `${size.toFixed(2)} USDT`, inline: true },
        { name: "Leverage", value: `${leverage}x`, inline: true },
        { name: "Score", value: String(signal.score), inline: true },
        { name: "Regime", value: signal.regime, inline: true },
      ],
      footer: { text: `Obsidra v${process.env.npm_package_version ?? "1.0.0"}` },
      timestamp: new Date().toISOString(),
    });
  }

  async alert(message: string): Promise<void> {
    await this.send(this.alertsUrl, {
      title: "Risk alert",
      description: message,
      color: 0xef4444,
      timestamp: new Date().toISOString(),
    });
  }

  async daily(metrics: LiveMetrics): Promise<void> {
    await this.send(this.dailyUrl, {
      title: `📊 Raport zilnic — ${new Date().toISOString().slice(0, 10)}`,
      color: metrics.totalPnlUsdt >= 0 ? 0x22c55e : 0xef4444,
      fields: [
        { name: "PnL", value: `${metrics.totalPnlUsdt.toFixed(2)} USDT`, inline: true },
        { name: "Trades", value: String(metrics.totalTrades), inline: true },
        { name: "Win Rate", value: `${metrics.winRate.toFixed(1)}%`, inline: true },
        { name: "Profit Factor", value: metrics.profitFactor.toFixed(2), inline: true },
        { name: "Fees", value: metrics.totalFeesPaidUsdt.toFixed(2), inline: true },
        { name: "Drawdown", value: `${metrics.currentDrawdown.toFixed(2)}%`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  private async send(url: string, embed: DiscordEmbed): Promise<void> {
    if (!url) return;
    const response = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}`);
  }
}
