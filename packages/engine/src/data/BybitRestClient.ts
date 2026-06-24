import crypto from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env.js';

export interface CreateOrderInput { symbol: string; side: 'Buy' | 'Sell'; qty: string; orderType?: 'Market' | 'Limit'; price?: string; reduceOnly?: boolean; }

export class BybitRestClient {
  private readonly http: AxiosInstance;
  private lastOkAt = 0;

  constructor() {
    const baseURL = env.BYBIT_TESTNET ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    this.http = axios.create({ baseURL, timeout: 10_000 });
  }

  get heartbeatOk() { return Date.now() - this.lastOkAt < 30_000; }

  async publicGet<T>(path: string, params: Record<string, string | number> = {}) {
    const res = await this.http.get<T>(path, { params });
    this.lastOkAt = Date.now();
    return res.data;
  }

  async privatePost<T>(path: string, body: Record<string, unknown>) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const payload = JSON.stringify(body);
    const sign = crypto.createHmac('sha256', env.BYBIT_API_SECRET).update(timestamp + env.BYBIT_API_KEY + recvWindow + payload).digest('hex');
    const res = await this.http.post<T>(path, payload, { headers: { 'X-BAPI-API-KEY': env.BYBIT_API_KEY, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow, 'X-BAPI-SIGN': sign, 'Content-Type': 'application/json' } });
    this.lastOkAt = Date.now();
    return res.data;
  }

  async createOrder(input: CreateOrderInput) {
    return this.privatePost('/v5/order/create', { category: 'linear', orderType: input.orderType ?? 'Market', ...input });
  }

  async getOpenPositions(symbol = env.TRADING_SYMBOL) {
    return this.publicGet('/v5/position/list', { category: 'linear', symbol });
  }
}
