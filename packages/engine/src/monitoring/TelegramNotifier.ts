import TelegramBot from "node-telegram-bot-api";
import { errorMessage, moduleLogger, prisma, type LiveMetrics, type SignalResult } from "@obsidra/shared";

const log = moduleLogger("TelegramNotifier");

export class TelegramNotifier {
  private readonly bot?: TelegramBot;
  private lastSentAt = 0;

  constructor(token: string, private readonly chatId: string) {
    if (token && chatId) {
      this.bot = new TelegramBot(token, { polling: true });
      this.registerCommands();
    }
  }

  async send(message: string): Promise<void> {
    if (!this.bot) return;
    const wait = Math.max(0, 3_000 - (Date.now() - this.lastSentAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: "HTML" });
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

  private registerCommands(): void {
    this.bot?.onText(/^\/(status|equity)$/, async (message) => {
      if (String(message.chat.id) !== this.chatId) return;
      const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
      await this.send(`🤖 Status: ${state?.status ?? "STOPPED"}`);
    });
    this.bot?.onText(/^\/(pause|resume|kill)$/, async (message, match) => {
      if (String(message.chat.id) !== this.chatId) return;
      const command = match?.[1];
      const status = command === "pause" ? "PAUSED" : command === "resume" ? "RUNNING" : "STOPPED";
      try {
        await prisma.botState.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status, reason: `Telegram /${command}` },
          update: { status, reason: `Telegram /${command}` },
        });
        await this.send(`✅ Comandă aplicată: ${status}`);
      } catch (error) {
        await this.send(`🔴 Eroare: ${errorMessage(error)}`);
      }
    });
    this.bot?.onText(/^\/trades$/, async (message) => {
      if (String(message.chat.id) !== this.chatId) return;
      const trades = await prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
      await this.send(trades.map((trade) => `${trade.symbol} ${trade.direction}: ${(trade.pnlUsdt ?? 0).toFixed(2)} USDT`).join("\n") || "Niciun trade.");
    });
  }
}
