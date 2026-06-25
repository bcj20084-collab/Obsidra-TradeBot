import { errorMessage, moduleLogger, prisma, type LiveMetrics, type SignalResult } from "@obsidra/shared";

const log = moduleLogger("TelegramNotifier");

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number } };
}

export interface ClosedTradeNotification {
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  pnlUsdt: number;
  pnlPct: number;
  reason: string;
  holdTimeMinutes: number;
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function price(value: number): string {
  if (value >= 1_000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function signed(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

export class TelegramNotifier {
  private readonly apiUrl?: string;
  private lastSentAt = 0;
  private updateOffset = 0;

  constructor(token: string, private readonly chatId: string) {
    if (token && chatId) {
      this.apiUrl = `https://api.telegram.org/bot${token}`;
      this.schedulePoll(0);
    }
  }

  get configured(): boolean {
    return Boolean(this.apiUrl);
  }

  async send(message: string): Promise<void> {
    if (!this.apiUrl) return;
    const wait = Math.max(0, 3_000 - (Date.now() - this.lastSentAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.request("sendMessage", {
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        this.lastSentAt = Date.now();
        return;
      } catch (error) {
        if (attempt === 2) log.error({ error }, "Telegram notification failed");
        else await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      }
    }
  }

  tradeOpened(symbol: string, signal: SignalResult, size: number, leverage: number): Promise<void> {
    const action = signal.direction === "LONG" ? "BUY" : "SELL";
    const dot = signal.direction === "LONG" ? "🟢" : "🔴";
    const stopPct = Math.abs((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100;
    const targetPct = Math.abs((signal.takeProfit - signal.entryPrice) / signal.entryPrice) * 100;
    return this.send([
      `${dot} <b>${action} | ${escapeHtml(symbol)}</b>`,
      `Confidence: <b>${(signal.confidence * 100).toFixed(1)}%</b>`,
      `Entry: <b>$${price(signal.entryPrice)}</b>`,
      `HTF Trend: <b>${signal.direction === "LONG" ? "bullish 📈" : "bearish 📉"}</b>`,
      `Market Regime: <b>${escapeHtml(signal.regime)}</b>`,
      `Stop Loss: <b>$${price(signal.stopLoss)} (${stopPct.toFixed(2)}%)</b>`,
      `Take Profit: <b>$${price(signal.takeProfit)} (${targetPct.toFixed(2)}%)</b>`,
      `Position: <b>${size.toFixed(2)} USDT · ${leverage}x</b>`,
      `Signal Score: <b>${signal.score}/100</b>`,
    ].join("\n"));
  }

  tradeClosed(trade: ClosedTradeNotification): Promise<void> {
    const profitable = trade.pnlUsdt >= 0;
    return this.send([
      `${profitable ? "✅" : "❌"} <b>CLOSE | ${escapeHtml(trade.symbol)}</b>`,
      `Side: <b>${escapeHtml(trade.direction)}</b>`,
      `Entry: <b>$${price(trade.entryPrice)}</b>`,
      `Exit: <b>$${price(trade.exitPrice)}</b>`,
      `PnL: <b>${signed(trade.pnlUsdt)} USDT (${signed(trade.pnlPct)}%)</b>`,
      `Reason: <b>${escapeHtml(trade.reason)}</b>`,
      `Duration: <b>${trade.holdTimeMinutes.toFixed(0)} min</b>`,
    ].join("\n"));
  }

  async status(metrics: LiveMetrics): Promise<void> {
    await this.send([
      `📊 <b>OBSIDRA STATUS</b>`,
      `Bot: <b>${escapeHtml(metrics.botStatus)}</b>`,
      `Market: <b>${escapeHtml(metrics.marketRegime)}</b>`,
      `Realized PnL: <b>${signed(metrics.totalPnlUsdt)} USDT</b>`,
      `Trades: <b>${metrics.totalTrades}</b> · Win Rate: <b>${metrics.winRate.toFixed(1)}%</b>`,
      `Open Positions: <b>${metrics.openPositionsCount ?? 0}</b>`,
      `Exposure: <b>${(metrics.totalExposureUsdt ?? 0).toFixed(2)} USDT</b>`,
      `Drawdown: <b>${metrics.currentDrawdown.toFixed(2)}%</b>`,
      `Signals 24h: <b>${metrics.signalsGenerated24h}</b> · Rejected: <b>${metrics.signalsRejected24h}</b>`,
      `Uptime: <b>${Math.floor(metrics.uptime / 60)} min</b>`,
    ].join("\n"));
  }

  async daily(metrics: LiveMetrics): Promise<void> {
    await this.send([
      `📈 <b>RAPORT ZILNIC OBSIDRA</b>`,
      `PnL: <b>${signed(metrics.totalPnlUsdt)} USDT</b>`,
      `Trades: <b>${metrics.totalTrades}</b>`,
      `Win Rate: <b>${metrics.winRate.toFixed(1)}%</b>`,
      `Profit Factor: <b>${metrics.profitFactor.toFixed(2)}</b>`,
      `Fees: <b>${metrics.totalFeesPaidUsdt.toFixed(2)} USDT</b>`,
      `Drawdown: <b>${metrics.currentDrawdown.toFixed(2)}%</b>`,
    ].join("\n"));
  }

  private schedulePoll(delayMs: number): void {
    if (!this.apiUrl) return;
    const timer = setTimeout(() => void this.poll(), delayMs);
    timer.unref();
  }

  private async poll(): Promise<void> {
    try {
      const updates = await this.request<TelegramUpdate[]>("getUpdates", {
        offset: this.updateOffset,
        timeout: 0,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);
        await this.handleCommand(update);
      }
    } catch (error) {
      log.warn({ error }, "Telegram command polling failed");
    } finally {
      this.schedulePoll(2_000);
    }
  }

  private async handleCommand(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || String(message.chat.id) !== this.chatId) return;
    const command = message.text.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/@.+$/, "");
    if (command === "/status" || command === "/equity") {
      const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
      const open = await prisma.trade.count({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
      await this.send(`🤖 <b>OBSIDRA</b>\nStatus: <b>${state?.status ?? "STOPPED"}</b>\nOpen Positions: <b>${open}</b>`);
      return;
    }
    if (command === "/pause" || command === "/resume" || command === "/kill") {
      const status = command === "/pause" ? "PAUSED" : command === "/resume" ? "RUNNING" : "STOPPED";
      try {
        await prisma.botState.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status, reason: `Telegram ${command}` },
          update: { status, reason: `Telegram ${command}` },
        });
        await this.send(`✅ Comandă aplicată: <b>${status}</b>`);
      } catch (error) {
        await this.send(`🔴 Eroare: ${escapeHtml(errorMessage(error))}`);
      }
      return;
    }
    if (command === "/trades") {
      const trades = await prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
      await this.send(trades.map((trade) =>
        `${trade.pnlUsdt === null ? "📌" : trade.pnlUsdt >= 0 ? "✅" : "❌"} <b>${trade.symbol}</b> ${trade.direction}: ${signed(trade.pnlUsdt ?? 0)} USDT`,
      ).join("\n") || "Niciun trade.");
    }
  }

  private async request<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.apiUrl) throw new Error("Telegram is not configured");
    const response = await fetch(`${this.apiUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json() as { ok: boolean; result?: T; description?: string };
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(payload.description ?? `Telegram HTTP ${response.status}`);
    }
    return payload.result;
  }
}
