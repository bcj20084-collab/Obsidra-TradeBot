import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi } from "lightweight-charts";

export function EquityCurve({ data }: { data: Array<{ date: string; equity: number }> }) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!element.current || data.length === 0) return;
    const container = element.current;
    chart.current = createChart(container, {
      height: 330,
      width: container.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8d99ae",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,.045)" },
        horzLines: { color: "rgba(255,255,255,.045)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,.10)" },
      timeScale: { borderColor: "rgba(255,255,255,.10)" },
      crosshair: {
        vertLine: { color: "rgba(80,227,194,.45)" },
        horzLine: { color: "rgba(80,227,194,.25)" },
      },
    });
    const series = chart.current.addSeries(AreaSeries, {
      lineColor: "#50e3c2",
      topColor: "rgba(80,227,194,.32)",
      bottomColor: "rgba(80,227,194,0)",
      lineWidth: 3,
      priceLineVisible: false,
    });
    series.setData(data.map((point) => ({ time: point.date, value: point.equity })));
    chart.current.timeScale().fitContent();
    const resize = new ResizeObserver(() => chart.current?.applyOptions({ width: container.clientWidth }));
    resize.observe(container);
    return () => {
      resize.disconnect();
      chart.current?.remove();
      chart.current = null;
    };
  }, [data]);

  if (!data.length) {
    return (
      <div className="chart-empty">
        <div className="text-lg font-bold text-white">Waiting for performance data</div>
        <p className="mt-2 text-sm text-slate-400">The equity curve appears after simulated trades are recorded.</p>
      </div>
    );
  }

  return <div className="min-h-[330px]" ref={element} />;
}
