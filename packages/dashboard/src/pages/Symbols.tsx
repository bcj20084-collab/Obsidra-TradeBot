import { useEffect, useState } from "react";
import { trpc } from "../lib/api";

interface SymbolItem { symbol: string; enabled: boolean; pnl: number; trades: number }

export function Symbols() {
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  useEffect(() => { void (trpc.query("symbols.list") as Promise<SymbolItem[]>).then(setSymbols); }, []);
  return (
    <div className="space-y-5">
      <div><div className="label">Portfolio universe</div><h1 className="mt-2 text-3xl font-bold">Symbols</h1></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{symbols.map((item) => <div className="card" key={item.symbol}><div className="flex justify-between"><h2 className="text-xl font-bold">{item.symbol}</h2><span className="text-emerald-400">● Active</span></div><div className="mt-6 grid grid-cols-2"><div><div className="label">PnL</div><div className="mt-2 font-mono">{item.pnl.toFixed(2)} USDT</div></div><div><div className="label">Trades</div><div className="mt-2 font-mono">{item.trades}</div></div></div></div>)}</div>
    </div>
  );
}
