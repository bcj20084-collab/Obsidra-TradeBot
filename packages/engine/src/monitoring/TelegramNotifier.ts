import TelegramBot from 'node-telegram-bot-api';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class TelegramNotifier {
  private bot?: TelegramBot;
  private lastSent = 0;
  constructor() { if (env.TELEGRAM_BOT_TOKEN) this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false }); }
  async send(message: string) {
    if (!this.bot || !env.TELEGRAM_CHAT_ID) return;
    const wait = Math.max(0, 3000 - (Date.now() - this.lastSent));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try { await this.bot.sendMessage(env.TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' }); this.lastSent = Date.now(); }
    catch (error) { logger.warn({ module: 'TelegramNotifier', error }, 'send failed'); }
  }
}
