import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi } from "lightweight-charts";

export function EquityCurve({ data }: { data: Array<{ date: string; equity: number }> }) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  useEffect(() => {
    if (!element.current) return;
    chart.current = createChart(element.current, {
      height: 300,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#768096" },
      grid: { vertLines: { color: "#171c27" }, horzLines: { color: "#171c27" } },
      rightPriceScale: { borderColor: "#222938" },
      timeScale: { borderColor: "#222938" },
    });
    const series = chart.current.addSeries(AreaSeries, {
      lineColor: "#50e3c2",
      topColor: "rgba(80,227,194,.30)",
      bottomColor: "rgba(80,227,194,0)",
      lineWidth: 2,
    });
    series.setData(data.map((point) => ({ time: point.date, value: point.equity })));
    chart.current.timeScale().fitContent();
    const resize = new ResizeObserver(() => chart.current?.applyOptions({ width: element.current?.clientWidth }));
    resize.observe(element.current);
    return () => {
      resize.disconnect();
      chart.current?.remove();
    };
  }, [data]);
  return <div ref={element} />;
}
