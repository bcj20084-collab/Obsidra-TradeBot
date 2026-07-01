import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BrainCircuit, Filter, Radar, RefreshCw, Search, TrendingUp } from "lucide-react";
import { trpc } from "../lib/api";
import type { MarketScanItem } from "../lib/types";

interface SymbolItem { symbol: string; enabled: boolean; pnl: number; trades: number }
interface ScannerResponse { updatedAt: string | null; best: MarketScanItem | null; markets: MarketScanItem[] }

type SortMode = "score" | "trend" | "volume" | "volatility";

export function Symbols() {
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [scanner, setScanner] = useState<ScannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("ALL");
  const [sort, setSort] = useState<SortMode>("score");

  const load = async () => {
    setLoading(true);
    try {
      const [nextSymbols, nextScanner] = await Promise.all([
        trpc.query("symbols.list") as Promise<SymbolItem[]>,
        trpc.query("symbols.scanner") as Promise<ScannerResponse>,
      ]);
      setSymbols(nextSymbols);
      setScanner(nextScanner);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const markets = useMemo(() => {
    const list = scanner?.markets ?? [];
    return [...list]
      .filter((market) => direction === "ALL" || market.direction === direction)
      .filter((market) => !query || `${market.symbol} ${market.exchange} ${market.reason}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (sort === "trend") return b.trendPct - a.trendPct;
        if (sort === "volume") return b.volumeRatio - a.volumeRatio;
        if (sort === "volatility") return b.volatilityPct - a.volatilityPct;
        return b.score - a.score;
      });
  }, [scanner?.markets, direction, query, sort]);

  const best = scanner?.best ?? markets[0] ?? null;
  const highQuality = markets.filter((market) => market.score >= 70).length;
  const watchlist = markets.filter((market) => market.score >= 50 && market.score < 70).length;
  const avgScore = markets.length ? markets.reduce((sum, market) => sum + market.score, 0) / markets.length : 0;

  return (
    <div className="space-y-6">
      <section className="market-hero glass-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="hero-eyebrow">
              <Radar size={14} />
              AI Market Scanner
            </div>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
              Universe scanner pentru piețele pe care botul le urmărește.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              Botul rankează piețele după trend, volum, volatilitate și data readiness. Aici vezi ce merită urmărit și ce e doar low priority.
            </p>
          </div>
          <button className="button glow-button flex items-center gap-2" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Refresh scan
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <ScannerStat icon={BrainCircuit} label="Average score" value={`${avgScore.toFixed(0)}/100`} detail={`${markets.length} markets scanned`} />
          <ScannerStat icon={TrendingUp} label="High quality" value={String(highQuality)} detail="Score 70+" tone="good" />
          <ScannerStat icon={Activity} label="Watchlist" value={String(watchlist)} detail="Score 50-69" tone="warn" />
          <ScannerStat icon={Radar} label="Updated" value={scanner?.updatedAt ? new Date(scanner.updatedAt).toLocaleTimeString() : "Waiting"} detail={scanner?.updatedAt ? new Date(scanner.updatedAt).toLocaleDateString() : "No scan yet"} />
        </div>
      </section>

      <section className="market-best-grid">
        <div className="glass-card market-best-card">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="label">Best candidate</div>
              <h2 className="mt-2 text-4xl font-black text-white">{best?.symbol ?? "No scan yet"}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                {best?.reason ?? "Scanner results appear after the engine completes a market scan."}
              </p>
            </div>
            <div className="score-ring scale-125" style={{ "--score": `${best?.score ?? 0}%` } as CSSProperties}>
              {best?.score ?? 0}
            </div>
          </div>
          {best ? (
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <ScanStat label="Price" value={formatPrice(best.price)} />
              <ScanStat label="Volume" value={`${best.volumeRatio.toFixed(2)}x`} />
              <ScanStat label="Volatility" value={`${best.volatilityPct.toFixed(2)}%`} />
              <ScanStat label="Trend" value={`${best.trendPct.toFixed(2)}%`} />
            </div>
          ) : null}
        </div>

        <div className="glass-card market-radar-card">
          <div className="label">Scanner operating logic</div>
          <h3 className="mt-2 text-2xl font-black text-white">Score = data + trend + volume + volatility.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Un scor mare nu înseamnă trade automat. Botul mai cere signal score, risk approval, portfolio guard și protecții paper/live.
          </p>
          <div className="mt-5 space-y-3">
            <RadarRule label="70+" text="High quality market candidate" />
            <RadarRule label="50-69" text="Watchlist, wait for cleaner setup" />
            <RadarRule label="<50" text="Low priority, scanner keeps watching" />
          </div>
        </div>
      </section>

      <div className="glass-card market-filter-bar">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input className="input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol, exchange or reason..." />
        </div>
        <select className="input md:w-44" value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option>ALL</option>
          <option>LONG</option>
          <option>SHORT</option>
          <option>WAITING</option>
        </select>
        <select className="input md:w-48" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
          <option value="score">Sort by score</option>
          <option value="trend">Sort by trend</option>
          <option value="volume">Sort by volume</option>
          <option value="volatility">Sort by volatility</option>
        </select>
      </div>

      {markets.length ? (
        <div className="market-grid">
          {markets.map((market) => (
            <MarketCard key={`${market.exchange}:${market.symbol}`} market={market} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Filter className="mx-auto text-slate-500" size={28} />
          <div className="mt-3 text-lg font-bold text-white">No markets match this filter</div>
          <p className="mt-2 text-sm text-slate-400">Clear filters or wait for the next AI market scan event.</p>
        </div>
      )}

      <div className="glass-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Configured symbols</div>
            <h3 className="mt-2 text-2xl font-black text-white">Trading universe</h3>
          </div>
          <span className="pill">{symbols.length} active</span>
        </div>
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

function MarketCard({ market }: { market: MarketScanItem }) {
  const tone = market.score >= 70 ? "good" : market.score >= 50 ? "warn" : "bad";
  return (
    <div className={`market-card market-card-${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-white">{market.symbol}</h2>
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
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-300">
        {market.trendPct >= 0 ? <ArrowUpRight size={14} className="mr-2 inline text-emerald-300" /> : <ArrowDownRight size={14} className="mr-2 inline text-rose-300" />}
        {market.reason}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="pill">{market.candleCount15m} x 15m</span>
        <span className="pill">{market.candleCount4h} x 4h</span>
      </div>
    </div>
  );
}

function ScannerStat({ icon: Icon, label, value, detail, tone }: { icon: typeof Radar; label: string; value: string; detail: string; tone?: "good" | "warn" }) {
  return (
    <div className="brain-stat">
      <Icon className={tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-cyan"} size={18} />
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 font-mono text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function RadarRule({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <span className="grid h-9 w-12 shrink-0 place-items-center rounded-xl border border-cyan/20 bg-cyan/10 font-mono text-xs font-black text-cyan">{label}</span>
      <span className="text-sm font-bold text-slate-300">{text}</span>
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
