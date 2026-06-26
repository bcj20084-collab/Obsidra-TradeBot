import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Radar, TrendingUp } from "lucide-react";
import { trpc } from "../lib/api";
import type { MarketScanItem } from "../lib/types";

interface SymbolItem { symbol: string; enabled: boolean; pnl: number; trades: number }
interface ScannerResponse { updatedAt: string | null; best: MarketScanItem | null; markets: MarketScanItem[] }

export function Symbols() {
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [scanner, setScanner] = useState<ScannerResponse | null>(null);

  useEffect(() => {
    void (trpc.query("symbols.list") as Promise<SymbolItem[]>).then(setSymbols);
    void (trpc.query("symbols.scanner") as Promise<ScannerResponse>).then(setScanner);
  }, []);

  const markets = scanner?.markets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Portfolio universe</div>
          <h1 className="mt-2 text-4xl font-black">Market Scanner</h1>
          <p className="mt-2 text-sm text-slate-400">The AI ranks markets by trend, volume, volatility, and data readiness.</p>
        </div>
        <div className="pill"><Radar size={14} className="mr-2" /> {scanner?.updatedAt ? new Date(scanner.updatedAt).toLocaleString() : "Waiting for scan"}</div>
      </div>

      <div className="glass-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label">Best candidate</div>
            <h2 className="mt-2 text-3xl font-black">{scanner?.best?.symbol ?? "No scan yet"}</h2>
            <p className="mt-2 text-sm text-slate-400">{scanner?.best?.reason ?? "Scanner results appear after the engine completes a market scan."}</p>
          </div>
          <div className="score-ring scale-125" style={{ "--score": `${scanner?.best?.score ?? 0}%` } as CSSProperties}>
            {scanner?.best?.score ?? 0}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {markets.map((market) => (
          <div className="card" key={`${market.exchange}:${market.symbol}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black">{market.symbol}</h2>
                  <span className={`direction-badge ${market.direction === "LONG" ? "direction-long" : market.direction === "SHORT" ? "direction-short" : ""}`}>{market.direction}</span>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{market.exchange}</div>
              </div>
              <div className="score-ring" style={{ "--score": `${market.score}%` } as CSSProperties}>{market.score}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <ScanStat label="Price" value={formatPrice(market.price)} />
              <ScanStat label="Volume" value={`${market.volumeRatio.toFixed(2)}x`} />
              <ScanStat label="Volatility" value={`${market.volatilityPct.toFixed(2)}%`} />
              <ScanStat label="Trend" value={`${market.trendPct.toFixed(2)}%`} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-slate-300">
              <TrendingUp size={14} className="mr-2 inline text-cyan" /> {market.reason}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <div className="label">Configured symbols</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {symbols.map((item) => (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4" key={item.symbol}>
              <div className="flex justify-between gap-3">
                <h2 className="text-xl font-bold">{item.symbol}</h2>
                <span className="pill pill-success">Active</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <ScanStat label="PnL" value={`${item.pnl.toFixed(2)} USDT`} />
                <ScanStat label="Trades" value={String(item.trades)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="label">{label}</div>
      <div className="mt-1 font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}

function formatPrice(value: number): string {
  return value >= 100 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}
