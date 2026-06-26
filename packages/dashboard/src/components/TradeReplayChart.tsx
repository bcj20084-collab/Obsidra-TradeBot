import type { ReplayCandle, TradeDetail } from "../lib/types";

export function TradeReplayChart({ trade, candles }: { trade: TradeDetail; candles: ReplayCandle[] }) {
  if (!candles.length) {
    return (
      <div className="chart-empty">
        <div>
          <div className="text-lg font-bold text-white">No replay candles yet</div>
          <p className="mt-2 text-sm text-slate-400">The engine will store candles after the next market-data warmup/live cycle.</p>
        </div>
      </div>
    );
  }

  const width = 920;
  const height = 360;
  const pad = { left: 52, right: 18, top: 24, bottom: 38 };
  const prices = candles.flatMap((candle) => [candle.high, candle.low, trade.entryPrice, trade.exitPrice, trade.stopLoss, trade.takeProfit].filter((value): value is number => value != null));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(Number.EPSILON, max - min);
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const candleStep = innerWidth / Math.max(1, candles.length);
  const candleWidth = Math.max(3, Math.min(9, candleStep * 0.58));
  const y = (price: number) => pad.top + ((max - price) / span) * innerHeight;
  const x = (index: number) => pad.left + index * candleStep + candleStep / 2;
  const markers = [
    { label: "ENTRY", value: trade.entryPrice, color: "#50e3c2" },
    { label: "EXIT", value: trade.exitPrice, color: "#fbbf24" },
    { label: "SL", value: trade.stopLoss, color: "#fb7185" },
    { label: "TP", value: trade.takeProfit, color: "#34d399" },
  ].filter((marker): marker is { label: string; value: number; color: string } => marker.value != null);

  return (
    <div className="trade-chart-shell">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Price replay</div>
          <h3 className="mt-1 text-xl font-black">Candles + bot levels</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {markers.map((marker) => <span className="pill" key={marker.label} style={{ borderColor: `${marker.color}55`, color: marker.color }}>{marker.label}</span>)}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full overflow-visible">
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="1">
            <stop offset="0%" stopColor="#50e3c2" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        <rect x={pad.left} y={pad.top} width={innerWidth} height={innerHeight} rx="18" fill="url(#chartGlow)" opacity="0.35" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const yy = pad.top + tick * innerHeight;
          const price = max - tick * span;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={8} y={yy + 4} fill="rgba(226,232,240,.55)" fontSize="11">{format(price)}</text>
            </g>
          );
        })}
        {candles.map((candle, index) => {
          const green = candle.close >= candle.open;
          const color = green ? "#34d399" : "#fb7185";
          const cx = x(index);
          const bodyY = y(Math.max(candle.open, candle.close));
          const bodyH = Math.max(1.5, Math.abs(y(candle.open) - y(candle.close)));
          return (
            <g key={`${candle.time}-${index}`}>
              <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" opacity="0.78" />
              <rect x={cx - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyH} rx="2" fill={color} opacity="0.88" />
            </g>
          );
        })}
        {markers.map((marker) => {
          const yy = y(marker.value);
          return (
            <g key={marker.label}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} stroke={marker.color} strokeDasharray="7 7" strokeWidth="1.6" />
              <rect x={width - pad.right - 78} y={yy - 12} width="74" height="24" rx="12" fill="#080b13" stroke={marker.color} opacity="0.96" />
              <text x={width - pad.right - 68} y={yy + 4} fill={marker.color} fontSize="11" fontWeight="800">{marker.label}</text>
            </g>
          );
        })}
        <text x={pad.left} y={height - 10} fill="rgba(226,232,240,.45)" fontSize="11">{new Date(candles[0]!.time).toLocaleString()}</text>
        <text x={width - 190} y={height - 10} fill="rgba(226,232,240,.45)" fontSize="11">{new Date(candles.at(-1)!.time).toLocaleString()}</text>
      </svg>
    </div>
  );
}

function format(value: number): string {
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
}
