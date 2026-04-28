"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { TradingViewLiveChart } from "@/components/finance/tradingview-live-chart";
import type { ApiEnvelope } from "@/types/api";
import type { MarketResponse, NormalizedMarketData } from "@/types/finance";

type Ec2IntradaySnapshot = {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
};

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

async function unwrap<T>(response: Response) {
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? "Request failed." : payload.error);
  }

  return payload.data;
}

export function MarketView() {
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [quote, setQuote] = useState<NormalizedMarketData | null>(null);
  const [query, setQuery] = useState("RELIANCE");
  const [activeSymbol, setActiveSymbol] = useState("RELIANCE");
  const [ec2Intraday, setEc2Intraday] = useState<Ec2IntradaySnapshot | null>(null);
  const [ec2Server, setEc2Server] = useState("");
  const [ec2Error, setEc2Error] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadMarket() {
    try {
      const data = await unwrap<MarketResponse>(await fetch("/api/market", { cache: "no-store" }));
      setMarket(data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to refresh market data.");
    } finally {
      setLoading(false);
    }
  }

  async function searchQuote(symbol = query) {
    const normalized = symbol.trim().toUpperCase();

    if (!normalized) {
      return;
    }

    try {
      const data = await unwrap<NormalizedMarketData>(
        await fetch(`/api/nse?symbol=${encodeURIComponent(normalized)}`, {
          cache: "no-store"
        })
      );
      setQuote(data);
      setActiveSymbol(data.symbol);
      setError("");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Unable to load quote.");
    }
  }

  async function loadEc2Intraday() {
    try {
      const response = await fetch("/api/ec2/market/intraday", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          securityId: "1333",
          exchangeSegment: "NSE_EQ"
        })
      });
      const payload = (await response.json()) as ApiEnvelope<Ec2IntradaySnapshot>;

      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "EC2 request failed." : payload.error);
      }

      setEc2Intraday(payload.data);
      setEc2Server(typeof payload.meta?.server === "string" ? payload.meta.server : "");
      setEc2Error("");
    } catch (cloudError) {
      setEc2Error(
        cloudError instanceof Error ? cloudError.message : "Unable to reach EC2 market backend."
      );
    }
  }

  useEffect(() => {
    void loadMarket();
    void searchQuote("RELIANCE");
    void loadEc2Intraday();
    const timer = window.setInterval(() => {
      void loadMarket();
      void searchQuote();
      void loadEc2Intraday();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Market</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            Live Indian market data
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            NSE is primary for prices. Yahoo is used only as fallback for quotes.
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          LIVE
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void searchQuote();
        }}
        className="flex flex-col gap-3 rounded-3xl border border-[var(--panel-border)] bg-white p-3 shadow-sm sm:flex-row"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[var(--surface-subtle)] px-3">
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stock symbol, e.g. TCS"
            className="min-h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-2xl bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white"
        >
          Search
        </button>
      </form>

      {error ? (
        <div className="rounded-3xl border border-rose-400/25 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {quote ? (
        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[var(--muted)]">Selected quote</p>
              <h3 className="mt-1 text-2xl font-semibold">{quote.symbol}</h3>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">
                {quote.price === null ? "Data not available" : formatCurrency(quote.price)}
              </p>
              <p className={quote.percentChange && quote.percentChange >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {quote.percentChange === null ? "--" : formatPercent(quote.percentChange)}
              </p>
              <p className="text-xs uppercase text-[var(--muted)]">Source: {quote.source}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--muted)]">EC2 Dhan intraday feed</p>
            <h3 className="mt-1 text-xl font-semibold">Security ID 1333</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Routed through: {ec2Server || "waiting for backend"}
            </p>
          </div>
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-700">
            Load balanced
          </span>
        </div>
        {ec2Error ? (
          <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-50 p-3 text-sm text-amber-800">
            {ec2Error}
          </p>
        ) : null}
        {ec2Intraday ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-5">
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">Price</p>
              <p className="font-semibold">{formatCurrency(ec2Intraday.price)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">Open</p>
              <p className="font-semibold">{formatCurrency(ec2Intraday.open)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">High</p>
              <p className="font-semibold">{formatCurrency(ec2Intraday.high)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">Low</p>
              <p className="font-semibold">{formatCurrency(ec2Intraday.low)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">Volume</p>
              <p className="font-semibold">{ec2Intraday.volume.toLocaleString("en-IN")}</p>
            </div>
          </div>
        ) : null}
      </section>

      <TradingViewLiveChart symbol={activeSymbol} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Indices</h3>
          <div className="space-y-3">
            {(market?.indices ?? []).map((index) => (
              <div key={index.name} className="flex items-center justify-between gap-4">
                <p className="font-medium">{index.name}</p>
                <p className={index.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatPercent(index.changePct)}
                </p>
              </div>
            ))}
            {!market?.indices.length && !loading ? <p className="text-sm text-[var(--muted)]">No index data.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Top gainers</h3>
          <div className="space-y-3">
            {(market?.gainers ?? []).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between gap-4">
                <p className="font-medium">{stock.symbol}</p>
                <p className="text-emerald-600">{formatPercent(stock.changePct)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--panel-border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Top losers</h3>
          <div className="space-y-3">
            {(market?.losers ?? []).map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between gap-4">
                <p className="font-medium">{stock.symbol}</p>
                <p className="text-rose-600">{formatPercent(stock.changePct)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
