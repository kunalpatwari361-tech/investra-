"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiEnvelope } from "@/types/api";
import type { MarketResponse, PortfolioSnapshot } from "@/types/finance";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !data.success) {
    throw new Error(data.success ? "Request failed." : data.error);
  }

  return data.data;
}

export function DashboardView() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [portfolioData, marketData] = await Promise.all([
        fetchJson<PortfolioSnapshot>("/api/portfolio"),
        fetchJson<MarketResponse>("/api/market")
      ]);
      setPortfolio(portfolioData);
      setMarket(marketData);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to refresh dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(
    () => [
      {
        label: "Current value",
        value: portfolio ? formatCurrency(portfolio.currentValue) : "--",
        tone: "neutral"
      },
      {
        label: "Total investment",
        value: portfolio ? formatCurrency(portfolio.totalInvestment) : "--",
        tone: "neutral"
      },
      {
        label: "P&L",
        value: portfolio ? formatCurrency(portfolio.profitLoss) : "--",
        tone: portfolio && portfolio.profitLoss >= 0 ? "positive" : "negative"
      },
      {
        label: "Returns",
        value: portfolio ? formatPercent(portfolio.returnsPercent) : "--",
        tone: portfolio && portfolio.returnsPercent >= 0 ? "positive" : "negative"
      }
    ],
    [portfolio]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
          Portfolio and market overview
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Dummy holdings are refreshed with live NSE prices and Yahoo fallback data.
        </p>
      </div>

      {error ? (
        <div className="rounded-3xl border border-rose-400/25 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-[var(--muted)]">{metric.label}</p>
            <p
              className={
                metric.tone === "positive"
                  ? "mt-3 text-2xl font-semibold text-emerald-600"
                  : metric.tone === "negative"
                    ? "mt-3 text-2xl font-semibold text-rose-600"
                    : "mt-3 text-2xl font-semibold"
              }
            >
              {loading ? "Loading..." : metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Market summary</h3>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              LIVE
            </span>
          </div>
          <div className="space-y-3">
            {(market?.indices ?? []).map((index) => (
              <div key={index.name} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{index.name}</p>
                  <p className="text-xs text-[var(--muted)]">{formatCurrency(index.value)}</p>
                </div>
                <p className={index.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatPercent(index.changePct)}
                </p>
              </div>
            ))}
            {!market?.indices.length && !loading ? (
              <p className="text-sm text-[var(--muted)]">Index data is not available.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Trending stocks</h3>
          <div className="space-y-3">
            {(market?.trending ?? []).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{stock.symbol}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Volume {stock.volume.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="text-right">
                  <p>{formatCurrency(stock.price)}</p>
                  <p className={stock.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {formatPercent(stock.changePct)}
                  </p>
                </div>
              </div>
            ))}
            {!market?.trending.length && !loading ? (
              <p className="text-sm text-[var(--muted)]">No trending data available.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
