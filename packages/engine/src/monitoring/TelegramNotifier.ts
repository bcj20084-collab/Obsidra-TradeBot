import { errorMessage, moduleLogger, prisma, type LiveMetrics, type SignalResult } from "@obsidra/shared";

const log = moduleLogger("TelegramNotifier");

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number } };
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

  async send(message: string): Promise<void> {
    if (!this.apiUrl) return;
    const wait = Math.max(0, 3_000 - (Date.now() - this.lastSentAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.request("sendMessage", { chat_id: this.chatId, text: message, parse_mode: "HTML" });
        this.lastSentAt = Date.now();
        return;
      } catch (error) {
        if (attempt === 2) log.error({ error }, "Telegram notification failed");
        else await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      }
    }
  }

  tradeOpened(symbol: string, signal: SignalResult, size: number, leverage: number): Promise<void> {
    return this.send(
      `✅ <b>Trade deschis</b>\n${symbol} ${signal.direction}\nEntry: ${signal.entryPrice}\nSL: ${signal.stopLoss}\nTP: ${signal.takeProfit}\nSize: ${size.toFixed(2)} USDT\nLeverage: ${leverage}x\nScor: ${signal.score}`,
    );
  }

  async daily(metrics: LiveMetrics): Promise<void> {
    await this.send(`📊 <b>Raport zilnic</b>\nPnL: ${metrics.totalPnlUsdt.toFixed(2)} USDT\nTrades: ${metrics.totalTrades}\nWin rate: ${metrics.winRate.toFixed(1)}%\nDrawdown: ${metrics.currentDrawdown.toFixed(2)}%`);
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
      await this.send(`🤖 Status: ${state?.status ?? "STOPPED"}`);
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
        await this.send(`✅ Comandă aplicată: ${status}`);
      } catch (error) {
        await this.send(`🔴 Eroare: ${errorMessage(error)}`);
      }
      return;
    }
    if (command === "/trades") {
      const trades = await prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
      await this.send(trades.map((trade) => `${trade.symbol} ${trade.direction}: ${(trade.pnlUsdt ?? 0).toFixed(2)} USDT`).join("\n") || "Niciun trade.");
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
