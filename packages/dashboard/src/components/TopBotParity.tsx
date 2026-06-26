import { CheckCircle2, CircleDashed, Hammer, ShieldCheck } from "lucide-react";

const rows = [
  { feature: "Paper/demo workflow", topBots: "Demo exchange or paper trading before live", obsidra: "Active on Binance market data", status: "ready" },
  { feature: "Backtesting", topBots: "Historical simulation before launch", obsidra: "Backtest page and engine available", status: "ready" },
  { feature: "Risk controls", topBots: "SL/TP, drawdown, exposure limits", obsidra: "Risk gate, DD, exposure, daily loss", status: "ready" },
  { feature: "Bot families", topBots: "Grid, DCA, combo, trend, copy", obsidra: "Trend, Grid, DCA, Scalp, Copy modules", status: "ready" },
  { feature: "Trailing protection", topBots: "Trailing SL, breakeven, timeout exits", obsidra: "Paper TP/SL, breakeven, trailing, timeout", status: "ready" },
  { feature: "Strategy builder", topBots: "No-code rules and templates", obsidra: "Next priority: visual rule presets", status: "next" },
  { feature: "Analytics terminal", topBots: "PnL, win-rate, fees, symbol stats", obsidra: "Cockpit dashboard live", status: "ready" },
  { feature: "Alerts", topBots: "Telegram/Discord/mobile notifications", obsidra: "Telegram and Discord hooks", status: "ready" },
];

const icon = {
  ready: CheckCircle2,
  next: Hammer,
  planned: CircleDashed,
};

const tone = {
  ready: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  next: "text-amber-300 bg-amber-300/10 border-amber-300/20",
  planned: "text-slate-300 bg-white/5 border-white/10",
};

export function TopBotParity() {
  return (
    <section className="glass-card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Competitive research</div>
          <h3 className="mt-2 text-2xl font-black">Top-bot parity matrix</h3>
          <p className="mt-2 text-sm text-slate-400">What leading bot platforms usually provide vs. where Obsidra stands now.</p>
        </div>
        <div className="pill"><ShieldCheck size={14} className="mr-2" /> Paper-first</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Feature</th>
              <th className="px-3 py-3">Top bots standard</th>
              <th className="px-3 py-3">Obsidra status</th>
              <th className="px-3 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const Icon = icon[row.status as keyof typeof icon];
              return (
                <tr className="border-t border-white/10" key={row.feature}>
                  <td className="px-3 py-4 font-black text-white">{row.feature}</td>
                  <td className="px-3 py-4 text-slate-400">{row.topBots}</td>
                  <td className="px-3 py-4 text-slate-300">{row.obsidra}</td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.13em] ${tone[row.status as keyof typeof tone]}`}>
                      <Icon size={14} />
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
