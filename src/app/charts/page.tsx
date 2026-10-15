"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

interface HistoryEntry {
  t: number;
  usd: number | null;
  par: number | null;
  eur: number | null;
  b: Record<string, [number | null, number | null]>;
}

const BANKS = [
  { key: "Banesco", color: "#00A651" },
  { key: "Mercantil", color: "#003DA5" },
  { key: "Provincial", color: "#004481" },
  { key: "BNC", color: "#D4213D" },
  { key: "Bancamiga", color: "#F58220" },
  { key: "BDT", color: "#0077B6" },
  { key: "Banplus", color: "#E30613" },
  { key: "Plaza", color: "#006341" },
  { key: "Activo", color: "#CC0000" },
  { key: "BDV", color: "#005BAA" },
];

const TIMEFRAMES = [
  { label: "1m", minutes: 1, maxHours: 24 },
  { label: "15m", minutes: 15, maxHours: 72 },
  { label: "1h", minutes: 60, maxHours: 168 },
  { label: "4h", minutes: 240, maxHours: 0 },
  { label: "1D", minutes: 1440, maxHours: 0 },
];

type LWChart = ReturnType<typeof import("lightweight-charts").createChart>;

const VET_OFFSET = -4 * 3600;

function aggregateSeries(
  raw: { time: number; value: number }[],
  bucketMinutes: number
): { time: number; value: number }[] {
  if (bucketMinutes < 1) return raw;

  const bucketSec = bucketMinutes * 60;
  const buckets = new Map<number, number[]>();

  for (const { time, value } of raw) {
    if (!value) continue;
    const key = Math.floor(time / bucketSec) * bucketSec;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(value);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, values]) => ({
      time,
      value: values.reduce((s, v) => s + v, 0) / values.length,
    }));
}

function aggregateOHLC(
  raw: { time: number; value: number }[],
  bucketMinutes: number
): { time: number; open: number; high: number; low: number; close: number }[] {
  const bucketSec = Math.max(bucketMinutes, 15) * 60;
  const buckets = new Map<number, number[]>();

  for (const { time, value } of raw) {
    if (!value) continue;
    const key = Math.floor(time / bucketSec) * bucketSec;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(value);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .filter(([, values]) => values.length > 0)
    .map(([time, values]) => ({
      time,
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values[values.length - 1],
    }));
}

export default function ChartsPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<LWChart | null>(null);
  const seriesRefs = useRef<Map<string, unknown>>(new Map());
  const [data, setData] = useState<HistoryEntry[]>([]);
  const [timeframe, setTimeframe] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"prom" | "mejor">("prom");
  const [chartType, setChartType] = useState<"lineas" | "velas">("lineas");

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((json) => {
        if (json.data && json.data.length > 0) {
          const adjusted = json.data.map((d: HistoryEntry) => ({ ...d, t: d.t + VET_OFFSET }));
          setData(adjusted);
        } else {
          setError(json.error || "No hay datos historicos todavia");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const buildChart = useCallback(async () => {
    if (!chartContainerRef.current || data.length === 0) return;

    const { createChart } = await import("lightweight-charts");

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    seriesRefs.current.clear();

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "#0b1120" },
        textColor: "#7a8fad",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#0e1f3d" },
        horzLines: { color: "#0e1f3d" },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#0e1f3d",
      },
      rightPriceScale: {
        borderColor: "#0e1f3d",
      },
    });

    chartRef.current = chart;

    const tf = TIMEFRAMES[timeframe];
    const valueIdx = metric === "mejor" ? 0 : 1;

    let chartData = data;
    if (tf.maxHours > 0) {
      const latest = data[data.length - 1].t;
      const cutoff = latest - tf.maxHours * 3600;
      chartData = data.filter((d) => d.t >= cutoff);
    }

    if (chartType === "velas") {
      const rawPoints: { time: number; value: number }[] = [];
      for (const entry of chartData) {
        const values: number[] = [];
        for (const bank of BANKS) {
          const pair = entry.b[bank.key];
          if (pair && pair[valueIdx]) values.push(pair[valueIdx]!);
        }
        if (values.length > 0) {
          const avg = values.reduce((s, v) => s + v, 0) / values.length;
          rawPoints.push({ time: entry.t, value: avg });
        }
      }

      if (rawPoints.length > 0) {
        const ohlc = aggregateOHLC(rawPoints, tf.minutes);
        const series = chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          title: metric === "prom" ? "Mercado Promedio" : "Mercado Mejor Precio",
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series.setData(ohlc as any);
        seriesRefs.current.set("mercado", series);
      }

      if (!hidden.has("BCV")) {
        const bcvPoints: { time: number; value: number }[] = [];
        for (const entry of chartData) {
          if (entry.par) bcvPoints.push({ time: entry.t, value: entry.par });
        }
        if (bcvPoints.length > 0) {
          const aggregated = aggregateSeries(bcvPoints, Math.max(tf.minutes, 15));
          const series = chart.addLineSeries({
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: 2,
            title: "USD Paralelo",
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          series.setData(aggregated as any);
          seriesRefs.current.set("BCV", series);
        }
      }

      const compPoints: { time: number; value: number }[] = [];
      const compIdx = valueIdx === 0 ? 1 : 0;
      for (const entry of chartData) {
        const values: number[] = [];
        for (const bank of BANKS) {
          const pair = entry.b[bank.key];
          if (pair && pair[compIdx]) values.push(pair[compIdx]!);
        }
        if (values.length > 0) {
          compPoints.push({ time: entry.t, value: values.reduce((s, v) => s + v, 0) / values.length });
        }
      }
      if (compPoints.length > 0) {
        const aggregated = aggregateSeries(compPoints, Math.max(tf.minutes, 15));
        const series = chart.addLineSeries({
          color: "#8b5cf6",
          lineWidth: 1,
          lineStyle: 2,
          title: metric === "mejor" ? "Promedio general" : "Mejor precio general",
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series.setData(aggregated as any);
      }
    } else {
      for (const bank of BANKS) {
        if (hidden.has(bank.key)) continue;

        const rawPoints: { time: number; value: number }[] = [];
        for (const entry of chartData) {
          const pair = entry.b[bank.key];
          if (pair && pair[valueIdx]) {
            rawPoints.push({ time: entry.t, value: pair[valueIdx]! });
          }
        }

        if (rawPoints.length === 0) continue;

        const aggregated = aggregateSeries(rawPoints, tf.minutes);
        const series = chart.addLineSeries({
          color: bank.color,
          lineWidth: 2,
          title: bank.key,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series.setData(aggregated as any);
        seriesRefs.current.set(bank.key, series);
      }

      if (!hidden.has("BCV")) {
        const bcvPoints: { time: number; value: number }[] = [];
        for (const entry of chartData) {
          if (entry.par) bcvPoints.push({ time: entry.t, value: entry.par });
        }
        if (bcvPoints.length > 0) {
          const aggregated = aggregateSeries(bcvPoints, tf.minutes);
          const series = chart.addLineSeries({
            color: "#f59e0b",
            lineWidth: 2,
            lineStyle: 2,
            title: "USD Paralelo",
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          series.setData(aggregated as any);
          seriesRefs.current.set("BCV", series);
        }
      }
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [data, timeframe, hidden, metric, chartType]);

  useEffect(() => {
    const cleanup = buildChart();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [buildChart]);

  const toggleBank = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <main className="flex flex-col h-screen" style={{ backgroundColor: "#0b1120", color: "#e8edf5" }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b flex-wrap" style={{ borderColor: "#0e1f3d" }}>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
          style={{ color: "#0266FD" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-sm sm:text-base font-semibold">Charts P2P</h1>

        {/* Chart type toggle */}
        <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "#0e1f3d" }}>
          {(["lineas", "velas"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: chartType === t ? "#1a2844" : "transparent",
                color: chartType === t ? "#e8edf5" : "#3d5070",
              }}
            >
              {t === "lineas" ? "Lineas" : "Velas"}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "#0e1f3d" }}>
          {(["prom", "mejor"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: metric === m ? "#1a2844" : "transparent",
                color: metric === m ? "#e8edf5" : "#3d5070",
              }}
            >
              {m === "prom" ? "Promedio" : "Mejor precio"}
            </button>
          ))}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 ml-auto rounded-lg p-0.5" style={{ backgroundColor: "#0e1f3d" }}>
          {TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.label}
              onClick={() => setTimeframe(i)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: timeframe === i ? "#1a2844" : "transparent",
                color: timeframe === i ? "#e8edf5" : "#3d5070",
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </header>

      {/* Chart area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: "#3d5070" }}>
            Cargando datos historicos...
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ color: "#3d5070" }}>
            <p>{error}</p>
            <p className="text-xs max-w-md text-center">
              El chart necesita datos historicos del Google Sheet. Asegurate de que el doGet del Apps Script
              este actualizado y re-deployado.
            </p>
          </div>
        )}
        <div ref={chartContainerRef} className="absolute inset-0" />
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-t text-xs"
        style={{ borderColor: "#0e1f3d" }}
      >
        {chartType === "lineas" ? (
          <>
            {BANKS.map((bank) => (
              <button
                key={bank.key}
                onClick={() => toggleBank(bank.key)}
                className="flex items-center gap-1.5 px-2 py-1 rounded transition-opacity"
                style={{ opacity: hidden.has(bank.key) ? 0.3 : 1 }}
              >
                <span
                  className="inline-block w-3 h-0.5 rounded-full"
                  style={{ backgroundColor: bank.color }}
                />
                {bank.key}
              </button>
            ))}
            <button
              onClick={() => toggleBank("BCV")}
              className="flex items-center gap-1.5 px-2 py-1 rounded transition-opacity"
              style={{ opacity: hidden.has("BCV") ? 0.3 : 1 }}
            >
              <span
                className="inline-block w-3 h-0.5 rounded-full"
                style={{ backgroundColor: "#f59e0b" }}
              />
              USD Paralelo
            </button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 px-2 py-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
              Alcista (cierre &gt; apertura)
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
              Bajista (cierre &lt; apertura)
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1" style={{ color: "#3d5070" }}>
              Velas = mercado general (promedio de todos los bancos)
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1">
              <span className="inline-block w-3 h-0.5 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
              {metric === "mejor" ? "Promedio" : "Mejor precio"}
            </span>
            <button
              onClick={() => toggleBank("BCV")}
              className="flex items-center gap-1.5 px-2 py-1 rounded transition-opacity"
              style={{ opacity: hidden.has("BCV") ? 0.3 : 1 }}
            >
              <span
                className="inline-block w-3 h-0.5 rounded-full"
                style={{ backgroundColor: "#f59e0b" }}
              />
              USD Paralelo
            </button>
          </>
        )}
        <span className="ml-auto" style={{ color: "#2a3d5a" }}>
          {data.length > 0
            ? `${data.length} puntos · desde ${new Date(data[0].t * 1000).toLocaleDateString("es-VE")}`
            : ""}
        </span>
      </div>
    </main>
  );
}
