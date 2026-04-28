"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time
} from "lightweight-charts";
import type { ApiEnvelope } from "@/types/api";
import type { ChartSnapshot } from "@/lib/services/chartService";
import type { NormalizedMarketData } from "@/types/finance";

type Props = {
  symbol: string;
};

function toLineData(snapshot: ChartSnapshot): LineData<Time>[] {
  return snapshot.chartData.map((point) => ({
    time: point.time as Time,
    value: point.close
  }));
}

async function unwrap<T>(response: Response) {
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? "Request failed." : payload.error);
  }

  return payload.data;
}

export function TradingViewLiveChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerRef.current || chartRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      height: 320,
      layout: {
        background: {
          color: "transparent"
        },
        textColor: getComputedStyle(document.documentElement)
          .getPropertyValue("--foreground")
          .trim()
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.16)" },
        horzLines: { color: "rgba(148, 163, 184, 0.16)" }
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.25)"
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.25)",
        timeVisible: true
      }
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#2563eb",
      lineWidth: 2
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    const resize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadChart() {
      try {
        const normalized = symbol.trim().toUpperCase() || "RELIANCE";
        const [chartData, quote] = await Promise.all([
          unwrap<ChartSnapshot>(
            await fetch(
              `/api/chart?symbol=${encodeURIComponent(normalized)}&range=1d&interval=1m`,
              { cache: "no-store" }
            )
          ),
          unwrap<NormalizedMarketData>(
            await fetch(`/api/nse?symbol=${encodeURIComponent(normalized)}`, {
              cache: "no-store"
            })
          )
        ]);

        if (cancelled) {
          return;
        }

        const lineData = toLineData(chartData);
        lineSeriesRef.current?.setData(lineData);

        if (quote.price !== null) {
          lineSeriesRef.current?.update({
            time: Math.floor(Date.now() / 1000) as Time,
            value: quote.price
          });
        }

        chartRef.current?.timeScale().fitContent();
        setError("");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load chart.");
        }
      }
    }

    void loadChart();
    const timer = window.setInterval(() => void loadChart(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol]);

  return (
    <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Live TradingView chart</h3>
          <p className="text-sm text-[var(--muted)]">{symbol.toUpperCase()} updates every 2 seconds</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          LIVE
        </span>
      </div>
      <div ref={containerRef} className="h-80 w-full" />
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}
