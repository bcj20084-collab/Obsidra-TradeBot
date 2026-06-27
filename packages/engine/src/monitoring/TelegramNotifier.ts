import { errorMessage, moduleLogger, prisma, type LiveMetrics, type SignalResult } from "@obsidra/shared";

const log = moduleLogger("TelegramNotifier");
const ICON = {
  bot: "\u{1F916}",
  buy: "\u{1F7E2}",
  sell: "\u{1F534}",
  success: "\u{2705}",
  loss: "\u{274C}",
  chart: "\u{1F4CA}",
  up: "\u{1F4C8}",
  down: "\u{1F4C9}",
  warning: "\u{26A0}\u{FE0F}",
  lock: "\u{1F512}",
  position: "\u{1F4CC}",
  money: "\u{1F4B0}",
} as const;

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number | string } };
}

interface TelegramBot {
  id: number;
  username?: string;
  first_name: string;
}

interface SendOptions {
  dedupeKey?: string;
  dedupeMs?: number;
  replyMarkup?: Record<string, unknown>;
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

export function escapeTelegramHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function formatTelegramPrice(value: number): string {
  if (value >= 1_000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export function formatSigned(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

export class TelegramNotifier {
  private readonly apiUrl?: string;
  private lastSentAt = 0;
  private updateOffset = 0;
  private pollingStarted = false;
  private pendingKillUntil = 0;
  private readonly sentKeys = new Map<string, number>();

  constructor(token: string, private readonly chatId: string) {
    if (token && chatId) this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  get configured(): boolean {
    return Boolean(this.apiUrl);
  }

  async initialize(): Promise<void> {
    if (!this.apiUrl || this.pollingStarted) return;
    const bot = await this.request<TelegramBot>("getMe", {});
    await this.request("deleteWebhook", { drop_pending_updates: false });
    await this.request("setMyCommands", {
      commands: [
        { command: "status", description: "Status bot si activitate" },
        { command: "positions", description: "Pozitii deschise" },
        { command: "pnl", description: "Profit si pierderi" },
        { command: "trades", description: "Ultimele tranzactii" },
        { command: "pause", description: "Opreste intrarile noi" },
        { command: "resume", description: "Reia tranzactionarea" },
        { command: "kill", description: "Oprire de urgenta" },
        { command: "help", description: "Lista comenzilor" },
      ],
    });
    this.pollingStarted = true;
    this.schedulePoll(0);
    log.info({ botId: bot.id, username: bot.username ?? null, chatConfigured: true }, "Telegram bot initialized");
  }

  async send(message: string, options: SendOptions = {}): Promise<void> {
    if (!this.apiUrl) return;
    const now = Date.now();
    if (options.dedupeKey) {
      const lastSent = this.sentKeys.get(options.dedupeKey) ?? 0;
      if (now - lastSent < (options.dedupeMs ?? 300_000)) return;
    }
    const wait = Math.max(0, 1_000 - (now - this.lastSentAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.request("sendMessage", {
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        });
        this.lastSentAt = Date.now();
        if (options.dedupeKey) this.sentKeys.set(options.dedupeKey, this.lastSentAt);
        this.pruneDedupeKeys();
        return;
      } catch (error) {
        if (attempt === 2) log.error({ error }, "Telegram notification failed");
        else await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      }
    }
  }

  tradeOpened(symbol: string, signal: SignalResult, size: number, leverage: number): Promise<void> {
    const action = signal.direction === "LONG" ? "BUY" : "SELL";
    const stopPct = Math.abs((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100;
    const targetPct = Math.abs((signal.takeProfit - signal.entryPrice) / signal.entryPrice) * 100;
    const riskReward = targetPct / Math.max(stopPct, Number.EPSILON);
    return this.send([
      `${signal.direction === "LONG" ? ICON.buy : ICON.sell} <b>${action} | ${escapeTelegramHtml(symbol)} | PAPER</b>`,
      `Confidence: <b>${(signal.confidence * 100).toFixed(1)}%</b> | Score: <b>${signal.score}/100</b>`,
      `Entry: <b>$${formatTelegramPrice(signal.entryPrice)}</b>`,
      `HTF Trend: <b>${signal.direction === "LONG" ? `bullish ${ICON.up}` : `bearish ${ICON.down}`}</b>`,
      `Market Regime: <b>${escapeTelegramHtml(signal.regime)}</b>`,
      `Stop Loss: <b>$${formatTelegramPrice(signal.stopLoss)} (${stopPct.toFixed(2)}%)</b>`,
      `Take Profit: <b>$${formatTelegramPrice(signal.takeProfit)} (${targetPct.toFixed(2)}%)</b>`,
      `Risk/Reward: <b>${riskReward.toFixed(2)}R</b>`,
      `Position: <b>${size.toFixed(2)} USDT | ${leverage}x</b>`,
      `Protections: <b>TP/SL + Breakeven + Trailing + Timeout</b>`,
    ].join("\n"), {
      dedupeKey: `open:${symbol}:${signal.direction}:${signal.timestamp ?? signal.entryPrice}`,
      dedupeMs: 24 * 60 * 60_000,
    });
  }

  tradeClosed(trade: ClosedTradeNotification): Promise<void> {
    const profitable = trade.pnlUsdt >= 0;
    return this.send([
      `${profitable ? ICON.success : ICON.loss} <b>CLOSE | ${escapeTelegramHtml(trade.symbol)}</b>`,
      `Side: <b>${escapeTelegramHtml(trade.direction)}</b>`,
      `Entry: <b>$${formatTelegramPrice(trade.entryPrice)}</b>`,
      `Exit: <b>$${formatTelegramPrice(trade.exitPrice)}</b>`,
      `PnL: <b>${formatSigned(trade.pnlUsdt)} USDT (${formatSigned(trade.pnlPct)}%)</b>`,
      `Reason: <b>${escapeTelegramHtml(trade.reason)}</b>`,
      `Duration: <b>${trade.holdTimeMinutes.toFixed(0)} min</b>`,
      `Mode: <b>PAPER</b>`,
    ].join("\n"), {
      dedupeKey: `close:${trade.symbol}:${trade.entryPrice}:${trade.exitPrice}:${trade.reason}`,
      dedupeMs: 24 * 60 * 60_000,
    });
  }

  alert(title: string, details: string, dedupeKey: string): Promise<void> {
    return this.send(
      `${ICON.warning} <b>${escapeTelegramHtml(title)}</b>\n${escapeTelegramHtml(details)}`,
      { dedupeKey: `alert:${dedupeKey}`, dedupeMs: 15 * 60_000 },
    );
  }

  async status(metrics: LiveMetrics): Promise<void> {
    await this.send([
      `${ICON.chart} <b>OBSIDRA STATUS</b>`,
      `Bot: <b>${escapeTelegramHtml(metrics.botStatus)}</b>`,
      `Market: <b>${escapeTelegramHtml(metrics.marketRegime)}</b>`,
      `Realized PnL: <b>${formatSigned(metrics.totalPnlUsdt)} USDT</b>`,
      `Trades: <b>${metrics.totalTrades}</b> | Win Rate: <b>${metrics.winRate.toFixed(1)}%</b>`,
      `Open Positions: <b>${metrics.openPositionsCount ?? 0}</b>`,
      `Exposure: <b>${(metrics.totalExposureUsdt ?? 0).toFixed(2)} USDT</b>`,
      `Drawdown: <b>${metrics.currentDrawdown.toFixed(2)}%</b>`,
      `Signals 24h: <b>${metrics.signalsGenerated24h}</b> | Rejected: <b>${metrics.signalsRejected24h}</b>`,
      `Uptime: <b>${Math.floor(metrics.uptime / 60)} min</b>`,
    ].join("\n"));
  }

  async daily(metrics: LiveMetrics): Promise<void> {
    await this.send([
      `${ICON.up} <b>RAPORT ZILNIC OBSIDRA</b>`,
      `PnL: <b>${formatSigned(metrics.totalPnlUsdt)} USDT</b>`,
      `Trades: <b>${metrics.totalTrades}</b>`,
      `Win Rate: <b>${metrics.winRate.toFixed(1)}%</b>`,
      `Profit Factor: <b>${metrics.profitFactor.toFixed(2)}</b>`,
      `Fees: <b>${metrics.totalFeesPaidUsdt.toFixed(2)} USDT</b>`,
      `Drawdown: <b>${metrics.currentDrawdown.toFixed(2)}%</b>`,
    ].join("\n"), { dedupeKey: `daily:${new Date().toISOString().slice(0, 10)}`, dedupeMs: 24 * 60 * 60_000 });
  }

  private schedulePoll(delayMs: number): void {
    if (!this.apiUrl || !this.pollingStarted) return;
    const timer = setTimeout(() => void this.poll(), delayMs);
    timer.unref();
  }

  private async poll(): Promise<void> {
    try {
      const updates = await this.request<TelegramUpdate[]>("getUpdates", {
        offset: this.updateOffset,
        timeout: 20,
        allowed_updates: ["message"],
      }, 30_000);
      for (const update of updates) {
        this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);
        await this.handleCommand(update);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (message.toLowerCase().includes("conflict")) {
        this.pollingStarted = false;
        log.warn({ error }, "Telegram command polling disabled because another getUpdates consumer is active; notifications remain enabled");
        return;
      }
      log.warn({ error }, "Telegram command polling failed");
    } finally {
      this.schedulePoll(1_000);
    }
  }

  private async handleCommand(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || String(message.chat.id) !== this.chatId) return;
    const command = message.text.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/@.+$/, "");
    try {
      switch (command) {
        case "/start":
        case "/help":
        case "/menu":
          await this.sendHelp();
          return;
        case "/status":
        case "/equity":
          await this.sendDatabaseStatus();
          return;
        case "/positions":
          await this.sendPositions();
          return;
        case "/pnl":
          await this.sendPnl();
          return;
        case "/trades":
          await this.sendTrades();
          return;
        case "/pause":
          await this.setBotStatus("PAUSED", "Telegram /pause");
          await this.send(`${ICON.success} Intrările noi sunt <b>PAUSED</b>.\nPozițiile existente rămân monitorizate.`);
          return;
        case "/resume":
          this.pendingKillUntil = 0;
          await this.setBotStatus("RUNNING", "Telegram /resume");
          await this.send(`${ICON.success} Botul este din nou <b>RUNNING</b>.`);
          return;
        case "/kill":
          this.pendingKillUntil = Date.now() + 60_000;
          await this.send([
            `${ICON.warning} <b>CONFIRMARE KILL SWITCH</b>`,
            "Această comandă oprește botul și anulează ordinele active.",
            "Trimite <b>/confirm_kill</b> în următoarele 60 secunde.",
            "Pentru anulare: <b>/cancel</b>",
          ].join("\n"));
          return;
        case "/confirm_kill":
          if (Date.now() > this.pendingKillUntil) {
            this.pendingKillUntil = 0;
            await this.send(`${ICON.lock} Confirmarea a expirat. Folosește din nou <b>/kill</b>.`);
            return;
          }
          this.pendingKillUntil = 0;
          await this.setBotStatus("STOPPED", "Telegram confirmed kill switch");
          await this.send(`${ICON.loss} <b>KILL SWITCH ACTIVAT</b>\nBotul a fost oprit.`);
          return;
        case "/cancel":
          this.pendingKillUntil = 0;
          await this.send(`${ICON.success} Acțiunea în așteptare a fost anulată.`);
          return;
        default:
          if (command?.startsWith("/")) await this.send(`Comandă necunoscută. Folosește <b>/help</b>.`);
      }
    } catch (error) {
      log.warn({ error, command }, "Telegram command failed");
      await this.send(`${ICON.loss} Eroare: ${escapeTelegramHtml(errorMessage(error))}`);
    }
  }

  private async sendHelp(): Promise<void> {
    await this.send([
      `${ICON.bot} <b>OBSIDRA CONTROL PANEL</b>`,
      "",
      "<b>Monitorizare</b>",
      "/status - stare bot și PnL azi",
      "/positions - poziții deschise",
      "/pnl - performanță azi / 7 zile / total",
      "/trades - ultimele tranzacții",
      "",
      "<b>Control</b>",
      "/pause - oprește intrările noi",
      "/resume - reia tranzacționarea",
      "/kill - pornește confirmarea de urgență",
      "/cancel - anulează confirmarea",
    ].join("\n"));
  }

  private async sendDatabaseStatus(): Promise<void> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [state, openTrades, todayTrades] = await Promise.all([
      prisma.botState.findUnique({ where: { id: "singleton" } }),
      prisma.trade.findMany({
        where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
        orderBy: { openedAt: "asc" },
      }),
      prisma.trade.findMany({
        where: { closedAt: { gte: start }, pnlUsdt: { not: null } },
        select: { pnlUsdt: true },
      }),
    ]);
    const pnl = todayTrades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
    const wins = todayTrades.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
    await this.send([
      `${ICON.chart} <b>OBSIDRA STATUS</b>`,
      `Status: <b>${escapeTelegramHtml(state?.status ?? "STOPPED")}</b>`,
      `Open Positions: <b>${openTrades.length}</b>`,
      `Exposure: <b>${openTrades.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0).toFixed(2)} USDT</b>`,
      `PnL Today: <b>${formatSigned(pnl)} USDT</b>`,
      `Trades Today: <b>${todayTrades.length}</b>`,
      `Win Rate Today: <b>${todayTrades.length ? ((wins / todayTrades.length) * 100).toFixed(1) : "0.0"}%</b>`,
      `Last Update: <b>${new Date().toISOString()}</b>`,
    ].join("\n"));
  }

  private async sendPositions(): Promise<void> {
    const trades = await prisma.trade.findMany({
      where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
      orderBy: { openedAt: "asc" },
      take: 10,
    });
    if (!trades.length) {
      await this.send(`${ICON.position} Nu există poziții deschise.`);
      return;
    }
    await this.send([
      `${ICON.position} <b>POZIȚII DESCHISE (${trades.length})</b>`,
      ...trades.flatMap((trade) => [
        "",
        `<b>${escapeTelegramHtml(trade.symbol)} | ${escapeTelegramHtml(trade.direction)}</b>`,
        `Entry: $${formatTelegramPrice(trade.entryPrice ?? 0)}`,
        `SL / TP: $${formatTelegramPrice(trade.stopLoss)} / $${formatTelegramPrice(trade.takeProfit)}`,
        `Size: ${trade.positionSizeUsdt.toFixed(2)} USDT | ${trade.leverage}x`,
        `Strategy: ${escapeTelegramHtml(trade.strategyId)}`,
      ]),
    ].join("\n"));
  }

  private async sendPnl(): Promise<void> {
    const now = Date.now();
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(now - 7 * 86_400_000);
    const trades = await prisma.trade.findMany({
      where: { pnlUsdt: { not: null } },
      orderBy: { closedAt: "asc" },
      select: { pnlUsdt: true, feeUsdt: true, closedAt: true },
    });
    const summarize = (from?: Date) => {
      const selected = from ? trades.filter((trade) => trade.closedAt && trade.closedAt >= from) : trades;
      const pnl = selected.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
      const fees = selected.reduce((sum, trade) => sum + (trade.feeUsdt ?? 0), 0);
      const wins = selected.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
      return { count: selected.length, pnl, fees, winRate: selected.length ? (wins / selected.length) * 100 : 0 };
    };
    const today = summarize(dayStart);
    const week = summarize(weekStart);
    const total = summarize();
    await this.send([
      `${ICON.money} <b>PERFORMANȚĂ</b>`,
      `Astăzi: <b>${formatSigned(today.pnl)} USDT</b> | ${today.count} trades | ${today.winRate.toFixed(1)}% WR`,
      `7 zile: <b>${formatSigned(week.pnl)} USDT</b> | ${week.count} trades | ${week.winRate.toFixed(1)}% WR`,
      `Total: <b>${formatSigned(total.pnl)} USDT</b> | ${total.count} trades | ${total.winRate.toFixed(1)}% WR`,
      `Fees Total: <b>${total.fees.toFixed(2)} USDT</b>`,
    ].join("\n"));
  }

  private async sendTrades(): Promise<void> {
    const trades = await prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
    if (!trades.length) {
      await this.send("Nicio tranzacție înregistrată.");
      return;
    }
    await this.send([
      "<b>ULTIMELE TRANZACȚII</b>",
      ...trades.map((trade) => {
        const icon = trade.pnlUsdt === null ? ICON.position : trade.pnlUsdt >= 0 ? ICON.success : ICON.loss;
        const result = trade.pnlUsdt === null ? trade.status : `${formatSigned(trade.pnlUsdt)} USDT`;
        return `${icon} <b>${escapeTelegramHtml(trade.symbol)}</b> ${escapeTelegramHtml(trade.direction)} | ${escapeTelegramHtml(result)}`;
      }),
    ].join("\n"));
  }

  private async setBotStatus(status: "RUNNING" | "PAUSED" | "STOPPED", reason: string): Promise<void> {
    await prisma.botState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", status, reason },
      update: { status, reason },
    });
  }

  private pruneDedupeKeys(): void {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [key, sentAt] of this.sentKeys) {
      if (sentAt < cutoff) this.sentKeys.delete(key);
    }
  }

  private async request<T = unknown>(method: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
    if (!this.apiUrl) throw new Error("Telegram is not configured");
    const response = await fetch(`${this.apiUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json() as { ok: boolean; result?: T; description?: string; error_code?: number };
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(payload.description ?? `Telegram HTTP ${response.status}`);
    }
    return payload.result;
  }
}
