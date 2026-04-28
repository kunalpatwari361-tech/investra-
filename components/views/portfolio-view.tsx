"use client";

import { useEffect, useState } from "react";
import type { ApiEnvelope } from "@/types/api";
import type { PortfolioSnapshot } from "@/types/finance";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function PortfolioView() {
  const [data, setData] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPortfolio() {
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      const payload = (await response.json()) as ApiEnvelope<PortfolioSnapshot>;

      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "Portfolio request failed." : payload.error);
      }

      setData(payload.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to refresh portfolio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortfolio();
    const timer = window.setInterval(() => void loadPortfolio(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Portfolio</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            Dummy holdings with live prices
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Broker integration is removed. Portfolio data is sample-only and uses backend market APIs.
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          LIVE
        </span>
      </div>

      {error ? (
        <div className="rounded-3xl border border-rose-400/25 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-[var(--panel-border)] bg-white p-5">
          <p className="text-sm text-[var(--muted)]">Investment</p>
          <p className="mt-3 text-2xl font-semibold">
            {loading || !data ? "Loading..." : formatCurrency(data.totalInvestment)}
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--panel-border)] bg-white p-5">
          <p className="text-sm text-[var(--muted)]">Current value</p>
          <p className="mt-3 text-2xl font-semibold">
            {loading || !data ? "Loading..." : formatCurrency(data.currentValue)}
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--panel-border)] bg-white p-5">
          <p className="text-sm text-[var(--muted)]">Total P&L</p>
          <p
            className={
              data && data.profitLoss >= 0
                ? "mt-3 text-2xl font-semibold text-emerald-600"
                : "mt-3 text-2xl font-semibold text-rose-600"
            }
          >
            {loading || !data
              ? "Loading..."
              : `${formatCurrency(data.profitLoss)} (${formatPercent(data.returnsPercent)})`}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--panel-border)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--panel-border)] text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              <tr>
                <th className="px-5 py-4">Asset</th>
                <th className="px-5 py-4">Qty</th>
                <th className="px-5 py-4">Buy price</th>
                <th className="px-5 py-4">Current price</th>
                <th className="px-5 py-4">Profit/Loss</th>
                <th className="px-5 py-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {(data?.holdings ?? []).map((holding) => (
                <tr key={holding.symbol} className="border-b border-[var(--panel-border)] last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium">{holding.assetName}</p>
                    <p className="text-xs text-[var(--muted)]">{holding.symbol}</p>
                  </td>
                  <td className="px-5 py-4">{holding.quantity}</td>
                  <td className="px-5 py-4">{formatCurrency(holding.buyPrice)}</td>
                  <td className="px-5 py-4">
                    {holding.currentPrice === null ? "Data not available" : formatCurrency(holding.currentPrice)}
                  </td>
                  <td
                    className={
                      holding.profitLoss >= 0
                        ? "px-5 py-4 font-medium text-emerald-600"
                        : "px-5 py-4 font-medium text-rose-600"
                    }
                  >
                    {formatCurrency(holding.profitLoss)} ({formatPercent(holding.returnsPercent)})
                  </td>
                  <td className="px-5 py-4 uppercase">{holding.source}</td>
                </tr>
              ))}
              {!data?.holdings.length && !loading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-[var(--muted)]" colSpan={6}>
                    No holdings available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
