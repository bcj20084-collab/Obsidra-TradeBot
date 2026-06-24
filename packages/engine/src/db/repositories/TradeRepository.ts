import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../client.js';
import type { Direction } from '../../signals/types.js';
import type { OrderState } from '../../execution/OrderStateMachine.js';

export interface CreateTradeRecordInput {
  bybitOrderId: string;
  symbol: string;
  direction: Direction;
  status: OrderState;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  leverage: number;
  signalScore: number;
  signalData: Prisma.InputJsonValue;
  mlScore?: number;
  marketRegime?: string;
}

export class TradeRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  create(input: CreateTradeRecordInput) {
    return this.db.trade.create({ data: input });
  }

  updateStatus(id: string, status: OrderState, data: Prisma.TradeUpdateInput = {}) {
    return this.db.trade.update({ where: { id }, data: { ...data, status } });
  }

  openForSymbol(symbol: string) {
    return this.db.trade.findFirst({ where: { symbol, status: { in: ['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CLOSING'] } }, orderBy: { createdAt: 'desc' } });
  }

  closedSince(since: Date) {
    return this.db.trade.findMany({ where: { closedAt: { gte: since }, pnlUsdt: { not: null } }, orderBy: { closedAt: 'desc' } });
  }

  recentClosed(limit = 50) {
    return this.db.trade.findMany({ where: { closedAt: { not: null }, pnlUsdt: { not: null } }, orderBy: { closedAt: 'desc' }, take: limit });
  }

  async stats(limit = 50, equity = 1000) {
    const trades = await this.recentClosed(limit);
    const wins = trades.filter((t) => (t.pnlUsdt ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnlUsdt ?? 0) < 0);
    const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      count: trades.length,
      winRate: trades.length ? wins.length / trades.length : 0.5,
      avgWin: avg(wins.map((t) => t.pnlUsdt ?? 0)) || 1,
      avgLoss: Math.abs(avg(losses.map((t) => t.pnlUsdt ?? 0))) || 1,
      equity,
    };
  }

  async dailyPnl(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const trades = await this.closedSince(start);
    return trades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
  }
}
