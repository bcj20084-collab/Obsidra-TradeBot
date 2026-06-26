import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { Trade, TradeDetail } from "../lib/types";
import { TradeTable } from "../components/TradeTable";
import { TradeReplayPanel } from "../components/TradeReplayPanel";
import { trpc } from "../lib/api";

export function Trades({ trades }: { trades: Trade[] }) {
  const [direction, setDirection] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<TradeDetail | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const filtered = useMemo(() => trades.filter((trade) => {
    const directionMatch = direction === "ALL" || trade.direction === direction;
    const queryMatch = !query || `${trade.symbol} ${trade.exchange} ${trade.strategyId} ${trade.status}`.toLowerCase().includes(query.toLowerCase());
    return directionMatch && queryMatch;
  }), [trades, direction, query]);

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
    try {
      const detail = await trpc.query("trades.detail", { id: trade.id }) as TradeDetail | null;
      if (detail) setSelectedTrade(detail);
    } finally {
      setLoadingReplay(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Execution archive</div>
          <h1 className="mt-2 text-4xl font-black">Trades</h1>
          <p className="mt-2 text-sm text-slate-400">Search, filter, and export the simulated execution tape.</p>
        </div>
        <button className="button flex items-center gap-2" onClick={exportCsv}><Download size={16} /> Export CSV</button>
      </div>

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

      <div className="glass-card"><TradeTable trades={filtered} onSelect={openReplay} /></div>
      <TradeReplayPanel trade={selectedTrade} loading={loadingReplay} onClose={() => setSelectedTrade(null)} />
    </div>
  );
}
