import { useMemo, useState } from "react";
import { Activity, Clock3, Download, Search, ShieldCheck, TrendingUp } from "lucide-react";
import type { ReplayCandle, Trade, TradeDetail } from "../lib/types";
import { TradeTable } from "../components/TradeTable";
import { TradeReplayPanel } from "../components/TradeReplayPanel";
import { trpc } from "../lib/api";

export function Trades({ trades }: { trades: Trade[] }) {
  const [direction, setDirection] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<TradeDetail | null>(null);
  const [replayCandles, setReplayCandles] = useState<ReplayCandle[]>([]);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const filtered = useMemo(() => trades.filter((trade) => {
    const directionMatch = direction === "ALL" || trade.direction === direction;
    const queryMatch = !query || `${trade.symbol} ${trade.exchange} ${trade.strategyId} ${trade.status}`.toLowerCase().includes(query.toLowerCase());
    return directionMatch && queryMatch;
  }), [trades, direction, query]);
  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const open = trades.filter((trade) => ["OPEN", "FILLED", "CLOSING"].includes(trade.status));
  const pnl = trades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
  const wins = closed.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;
  const avgHoldMinutes = closed.length
    ? closed.reduce((sum, trade) => sum + (trade.holdTimeSeconds ?? 0), 0) / closed.length / 60
    : 0;

  const exportCsv = () => {
    const csv = [
      "date,symbol,exchange,strategy,direction,entry,exit,pnl,fee,score,status",
      ...filtered.map((t) => [t.createdAt, t.symbol, t.exchange, t.strategyId, t.direction, t.entryPrice, t.exitPrice, t.pnlUsdt, t.feeUsdt, t.signalScore, t.status].join(",")),
    ].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "obsidra-trades.csv";
    anchor.click();
  };

  const openReplay = async (trade: Trade) => {
    setLoadingReplay(true);
    setSelectedTrade({ ...trade, transitions: [], journalEntries: [] });
    setReplayCandles([]);
    try {
      const [detail, candles] = await Promise.all([
        trpc.query("trades.detail", { id: trade.id }) as Promise<TradeDetail | null>,
        trpc.query("trades.candles", { id: trade.id, interval: "15", limit: 220 }) as Promise<ReplayCandle[]>,
      ]);
      if (detail) setSelectedTrade(detail);
      setReplayCandles(candles);
    } finally {
      setLoadingReplay(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="trade-desk-hero glass-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="hero-eyebrow">
              <Activity size={14} />
              Execution archive
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white">Premium Trade Desk</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Aici vezi tot ce face bot-ul: intrări, ieșiri, PnL, hold time și replay când apeși pe un trade.
            </p>
          </div>
          <button className="button glow-button flex items-center gap-2" onClick={exportCsv}><Download size={16} /> Export CSV</button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <TradeDeskStat icon={TrendingUp} label="Net PnL" value={`${formatSigned(pnl)} USDT`} tone={pnl >= 0 ? "good" : "bad"} />
          <TradeDeskStat icon={ShieldCheck} label="Win rate" value={`${winRate.toFixed(1)}%`} tone={winRate >= 50 ? "good" : "warn"} />
          <TradeDeskStat icon={Activity} label="Open trades" value={String(open.length)} />
          <TradeDeskStat icon={Clock3} label="Avg hold" value={`${avgHoldMinutes.toFixed(0)}m`} />
        </div>
      </section>

      <div className="glass-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input className="input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol, exchange, strategy, status..." />
        </div>
        <select className="input md:w-44" value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option>ALL</option>
          <option>LONG</option>
          <option>SHORT</option>
        </select>
      </div>

      <div className="glass-card trade-table-shell">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Execution tape</div>
            <h2 className="mt-1 text-2xl font-black">Click orice trade pentru replay live</h2>
          </div>
          <span className="pill">{filtered.length} rows</span>
        </div>
        <TradeTable trades={filtered} onSelect={openReplay} />
      </div>
      <TradeReplayPanel trade={selectedTrade} candles={replayCandles} loading={loadingReplay} onClose={() => setSelectedTrade(null)} />
    </div>
  );
}

function TradeDeskStat({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="trade-desk-stat">
      <div className={`metric-icon ${tone === "good" ? "tone-emerald" : tone === "bad" ? "tone-rose" : tone === "warn" ? "tone-amber" : "tone-cyan"}`}>
        <Icon size={17} />
      </div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate font-mono text-xl font-black text-white">{value}</div>
    </div>
  );
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
