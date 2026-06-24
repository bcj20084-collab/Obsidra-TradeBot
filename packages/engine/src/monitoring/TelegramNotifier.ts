import TelegramBot from 'node-telegram-bot-api';
import { env } from '../config/env.js';
import type { MetricsCollector } from './MetricsCollector.js';
import { logger } from '../utils/logger.js';

export class TelegramNotifier {
  private bot?: TelegramBot;
  private lastSent = 0;

  constructor(private readonly metrics?: MetricsCollector) {
    if (env.TELEGRAM_BOT_TOKEN) this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });
  }

  startCommandPolling() {
    if (!env.TELEGRAM_BOT_TOKEN) return;
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
    this.bot.onText(/^\/status$/, (msg) => void this.reply(msg.chat.id, this.statusText()));
    this.bot.onText(/^\/equity$/, (msg) => void this.reply(msg.chat.id, this.equityText()));
    this.bot.onText(/^\/trades$/, (msg) => void this.reply(msg.chat.id, 'Ultimele trade-uri vor fi citite din ExecutionJournal când DB wiring este activ.'));
    this.bot.onText(/^\/pause$/, (msg) => void this.reply(msg.chat.id, 'Botul trebuie pus pe pauză prin API/dashboard. Comanda Telegram este conectată ca interfață safe.'));
    this.bot.onText(/^\/resume$/, (msg) => void this.reply(msg.chat.id, 'Botul trebuie reluat prin API/dashboard. Comanda Telegram este conectată ca interfață safe.'));
    this.bot.onText(/^\/kill$/, (msg) => void this.reply(msg.chat.id, 'Kill switch primit. În live mode trebuie să închidă pozițiile prin OrderManager înainte de stop.'));
  }

  async send(message: string) {
    if (!this.bot || !env.TELEGRAM_CHAT_ID) return;
    await this.reply(env.TELEGRAM_CHAT_ID, message);
  }

  private async reply(chatId: string | number, message: string) {
    if (!this.bot) return;
    const wait = Math.max(0, 3000 - (Date.now() - this.lastSent));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try { await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' }); this.lastSent = Date.now(); }
    catch (error) { logger.warn({ module: 'TelegramNotifier', error }, 'send failed'); }
  }

  private statusText() {
    const m = this.metrics?.snapshot();
    if (!m) return 'Obsidra: metrics collector not attached.';
    return `Status: ${m.botStatus}\nPnL: ${m.totalPnlUsdt} USDT\nWin rate: ${m.winRate}%\nDD: ${m.currentDrawdown}%`;
  }

  private equityText() {
    const m = this.metrics?.snapshot();
    if (!m) return 'Equity metrics unavailable.';
    const last = m.equityCurve.at(-1);
    return `Equity: ${last?.equity ?? 0}\nMax DD: ${m.maxDrawdown}%`;
  }
}
