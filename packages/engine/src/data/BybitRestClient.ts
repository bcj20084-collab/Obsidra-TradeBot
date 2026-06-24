import crypto from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { RateLimiter } from '../utils/RateLimiter.js';

export interface CreateOrderInput { symbol: string; side: 'Buy' | 'Sell'; qty: string; orderType?: 'Market' | 'Limit'; price?: string; reduceOnly?: boolean; }
export interface BybitEnvelope<T> { retCode: number; retMsg: string; result: T; time: number; }

export class BybitRestClient {
  private readonly http: AxiosInstance;
  private readonly privateLimiter = new RateLimiter(10, 10);
  private readonly publicLimiter = new RateLimiter(50, 50);
  private lastOkAt = 0;

  constructor() {
    const baseURL = env.BYBIT_TESTNET ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    this.http = axios.create({ baseURL, timeout: 10_000 });
  }

  get heartbeatOk() { return Date.now() - this.lastOkAt < 30_000; }

  async publicGet<T>(path: string, params: Record<string, string | number> = {}) {
    await this.publicLimiter.wait();
    const res = await this.http.get<BybitEnvelope<T>>(path, { params });
    this.lastOkAt = Date.now();
    if (res.data.retCode !== 0) throw new Error(`Bybit public error ${res.data.retCode}: ${res.data.retMsg}`);
    return res.data.result;
  }

  async privateGet<T>(path: string, params: Record<string, string | number> = {}) {
    await this.privateLimiter.wait();
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const sign = crypto.createHmac('sha256', env.BYBIT_API_SECRET).update(timestamp + env.BYBIT_API_KEY + recvWindow + query).digest('hex');
    const res = await this.http.get<BybitEnvelope<T>>(path, { params, headers: { 'X-BAPI-API-KEY': env.BYBIT_API_KEY, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow, 'X-BAPI-SIGN': sign } });
    this.lastOkAt = Date.now();
    if (res.data.retCode !== 0) throw new Error(`Bybit private error ${res.data.retCode}: ${res.data.retMsg}`);
    return res.data.result;
  }

  async privatePost<T>(path: string, body: Record<string, unknown>) {
    await this.privateLimiter.wait();
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const payload = JSON.stringify(body);
    const sign = crypto.createHmac('sha256', env.BYBIT_API_SECRET).update(timestamp + env.BYBIT_API_KEY + recvWindow + payload).digest('hex');
    const res = await this.http.post<BybitEnvelope<T>>(path, payload, { headers: { 'X-BAPI-API-KEY': env.BYBIT_API_KEY, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow, 'X-BAPI-SIGN': sign, 'Content-Type': 'application/json' } });
    this.lastOkAt = Date.now();
    if (res.data.retCode !== 0) throw new Error(`Bybit private error ${res.data.retCode}: ${res.data.retMsg}`);
    return res.data.result;
  }

  async createOrder(input: CreateOrderInput) {
    return this.privatePost('/v5/order/create', { category: 'linear', orderType: input.orderType ?? 'Market', ...input });
  }

  async getOpenPositions(symbol = env.TRADING_SYMBOL) {
    if (env.PAPER_TRADING || !env.BYBIT_API_KEY) return { list: [] };
    return this.privateGet('/v5/position/list', { category: 'linear', symbol });
  }

  async getFundingRate(symbol = env.TRADING_SYMBOL) {
    return this.publicGet('/v5/market/funding/history', { category: 'linear', symbol, limit: 1 });
  }
}
