import type { Direction } from "@obsidra/shared";

export interface CopySourcePosition {
  symbol: string;
  direction: Direction;
  size: number;
  entryPrice: number;
  leverage: number;
}

export interface CopyPositionSource {
  getPositions(traderId: string): Promise<CopySourcePosition[]>;
}

export class HttpCopyPositionSource implements CopyPositionSource {
  constructor(private readonly baseUrl: string) {
    if (baseUrl && !baseUrl.startsWith("https://")) throw new Error("COPY_POSITION_FEED_URL must use HTTPS");
  }

  async getPositions(traderId: string): Promise<CopySourcePosition[]> {
    if (!this.baseUrl) return [];
    const url = new URL(this.baseUrl);
    url.searchParams.set("traderId", traderId);
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Copy position feed returned HTTP ${response.status}`);
    const rows = await response.json() as Array<Partial<CopySourcePosition>>;
    return rows.flatMap((row) => {
      if (!row.symbol || !["LONG", "SHORT"].includes(String(row.direction)) || !Number.isFinite(row.size) || !Number.isFinite(row.entryPrice)) return [];
      return [{
        symbol: row.symbol,
        direction: row.direction as Direction,
        size: Number(row.size),
        entryPrice: Number(row.entryPrice),
        leverage: Math.max(1, Number(row.leverage ?? 1)),
      }];
    });
  }
}
