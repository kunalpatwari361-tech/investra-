import { createSuccessEnvelope, fetchJson } from "@/lib/services/api-utils";
import type { LiveChartPoint, LiveMarketQuote } from "@/types/finance";

type YahooChartResult = {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    regularMarketVolume?: number;
    regularMarketTime?: number;
    exchangeName?: string;
    longName?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
      regularMarketVolume?: number;
      regularMarketTime?: number;
    }>;
    error?: unknown;
  };
};

export type ChartSnapshot = {
  symbol: string;
  chartData: LiveChartPoint[];
  timestamp: number;
  exchangeName: string | null;
  longName: string | null;
};

export type YahooQuoteFallback = LiveMarketQuote & {
  timestamp: number;
};

const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 Atlas Yahoo Chart Service"
};

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseYahooChart(symbol: string, payload: YahooChartResponse): ChartSnapshot {
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description ?? payload.chart.error.code ?? "Yahoo chart error");
  }

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const open = quote?.open ?? [];
  const high = quote?.high ?? [];
  const low = quote?.low ?? [];
  const close = quote?.close ?? [];

  const chartData = timestamps
    .map((time, index) => {
      const openValue = open[index];
      const highValue = high[index];
      const lowValue = low[index];
      const closeValue = close[index];

      if (
        typeof time !== "number" ||
        typeof openValue !== "number" ||
        typeof highValue !== "number" ||
        typeof lowValue !== "number" ||
        typeof closeValue !== "number"
      ) {
        return null;
      }

      return {
        time,
        open: openValue,
        high: highValue,
        low: lowValue,
        close: closeValue
      } satisfies LiveChartPoint;
    })
    .filter((point): point is LiveChartPoint => Boolean(point));

  return {
    symbol,
    chartData,
    timestamp:
      chartData[chartData.length - 1]?.time ??
      result?.meta?.regularMarketTime ??
      Math.floor(Date.now() / 1000),
    exchangeName: result?.meta?.exchangeName ?? null,
    longName: result?.meta?.longName ?? null
  };
}

export async function getYahooChart(symbol: string, range = "1d", interval = "1m") {
  const normalized = symbol.trim().toUpperCase();
  const { data, durationMs } = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}.NS?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
    "Yahoo chart request failed",
    { headers: REQUEST_HEADERS }
  );

  return createSuccessEnvelope("yahoo", parseYahooChart(normalized, data), { durationMs });
}

export async function getYahooQuoteFallback(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  const { data, durationMs } = await fetchJson<YahooQuoteResponse>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(normalized)}.NS`,
    "Yahoo quote fallback request failed",
    { headers: REQUEST_HEADERS }
  );
  const quote = data.quoteResponse?.result?.[0];

  if (!quote) {
    throw new Error("Yahoo quote fallback returned no result.");
  }

  return createSuccessEnvelope(
    "yahoo",
    {
      symbol: normalized,
      price: safeNumber(quote.regularMarketPrice),
      change: safeNumber(quote.regularMarketChange),
      percentChange: safeNumber(quote.regularMarketChangePercent),
      volume: safeNumber(quote.regularMarketVolume),
      timestamp: quote.regularMarketTime ?? Math.floor(Date.now() / 1000)
    } satisfies YahooQuoteFallback,
    {
      durationMs,
      fallbackFor: "nse"
    }
  );
}
