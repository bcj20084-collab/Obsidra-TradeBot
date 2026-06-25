export type ExchangeId = "bybit" | "binance";

export interface OHLCVCandle {
  symbol: string;
  interval: string;
  openTime: number; open: number; high: number; low: number; close: number;
  volume: number; closeTime: number; confirmed: boolean;
}

export interface OrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
  clientOrderId: string;
}

export interface OrderResult {
  exchangeOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  status: "New" | "Filled" | "Cancelled" | "Rejected";
  avgFillPrice: number;
  filledQty: number;
  feeUsdt: number;
  timestamp: number;
}

export interface Position {
  symbol: string; side: "Long" | "Short"; size: number; entryPrice: number;
  markPrice: number; unrealizedPnl: number; leverage: number; liquidationPrice: number;
}

export interface ClosedPosition {
  symbol: string;
  side: "Long" | "Short";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnlUsdt: number;
  feeUsdt: number;
  closedAt: number;
}

export interface IExchangeAdapter {
  readonly exchangeId: ExchangeId;
  readonly paperTrading: boolean;
  subscribeCandles(symbol: string, intervals: string[], onCandle: (candle: OHLCVCandle) => void): void;
  subscribeTicker(symbol: string, onTick: (price: number, fundingRate: number) => void): void;
  getBestBidAsk(symbol: string): Promise<{ bid: number; ask: number }>;
  getHistoricalCandles(symbol: string, interval: string, limit: number): Promise<OHLCVCandle[]>;
  getWalletBalance(): Promise<number>;
  getOpenPositions(symbol?: string): Promise<Position[]>;
  getLatestClosedPosition?(symbol: string): Promise<ClosedPosition | null>;
  getFundingRate(symbol: string): Promise<number>;
  placeOrder(params: OrderParams): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
  setLeverage(symbol: string, leverage: number): Promise<void>;
  ping(): Promise<number>;
  getServerTime(): Promise<number>;
}
