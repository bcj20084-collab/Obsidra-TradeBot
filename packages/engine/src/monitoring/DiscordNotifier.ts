import { WebhookClient } from 'discord.js';
import { logger } from '../utils/logger.js';

export class DiscordNotifier {
  private client?: WebhookClient;
  constructor(url?: string) { if (url) this.client = new WebhookClient({ url }); }
  async send(content: string) {
    if (!this.client) return;
    try { await this.client.send({ content }); } catch (error) { logger.warn({ module: 'DiscordNotifier', error }, 'send failed'); }
  }
}
