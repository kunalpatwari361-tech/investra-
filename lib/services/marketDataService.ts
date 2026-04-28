import { getYahooQuoteFallback } from "@/lib/services/chartService";
import { createSuccessEnvelope } from "@/lib/services/api-utils";
import {
  getNseIndices,
  getStockQuote
} from "@/lib/services/stockService";
import type {
  LiveIndexSnapshot,
  MarketResponse,
  NormalizedMarketData,
  PortfolioHolding,
  PortfolioSnapshot
} from "@/types/finance";

const CACHE_TTL_MS = 5_000;
const DEFAULT_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "LT",
  "ITC",
  "AXISBANK",
  "MARUTI"
];

const DUMMY_HOLDINGS = [
  {
    symbol: "RELIANCE",
    assetName: "Reliance Industries",
    quantity: 8,
    buyPrice: 2440
  },
  {
    symbol: "TCS",
    assetName: "Tata Consultancy Services",
    quantity: 5,
    buyPrice: 3680
  },
  {
    symbol: "INFY",
    assetName: "Infosys",
    quantity: 12,
    buyPrice: 1420
  },
  {
    symbol: "HDFCBANK",
    assetName: "HDFC Bank",
    quantity: 10,
    buyPrice: 1510
  }
];

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();
const lastKnownQuote = new Map<string, NormalizedMarketData>();

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.NS$/, "");
}

function getCached<T>(key: string) {
  const entry = cache.get(key);

  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

function setCached<T>(key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return value;
}

function setLastKnownQuote(value: NormalizedMarketData) {
  lastKnownQuote.set(value.symbol, value);
  return value;
}

function dedupeSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
}

function toMarketData(
  symbol: string,
  source: NormalizedMarketData["source"],
  value: {
    price: number | null;
    change: number | null;
    percentChange: number | null;
    volume: number | null;
    timestamp?: number;
  }
): NormalizedMarketData {
  return {
    symbol,
    price: value.price,
    change: value.change,
    percentChange: value.percentChange,
    volume: value.volume,
    timestamp: value.timestamp ?? Date.now(),
    source
  };
}

export async function getUnifiedQuote(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const cacheKey = `quote:${normalized}`;
  const cached = getCached<NormalizedMarketData>(cacheKey);

  if (cached) {
    return createSuccessEnvelope(cached.source, cached, { cached: true });
  }

  try {
    const envelope = await getStockQuote(normalized);
    const data = toMarketData(normalized, "nse", {
      price: envelope.data.price,
      change: envelope.data.change,
      percentChange: envelope.data.percentChange,
      volume: envelope.data.volume
    });

    setLastKnownQuote(data);
    return createSuccessEnvelope("nse", setCached(cacheKey, data), {
      fallbackUsed: false,
      cached: false
    });
  } catch {
    try {
      const fallback = await getYahooQuoteFallback(normalized);
      const data = toMarketData(normalized, "yahoo", {
        price: fallback.data.price,
        change: fallback.data.change,
        percentChange: fallback.data.percentChange,
        volume: fallback.data.volume,
        timestamp: fallback.data.timestamp * 1000
      });

      setLastKnownQuote(data);
      return createSuccessEnvelope("yahoo", setCached(cacheKey, data), {
        fallbackUsed: true,
        cached: false
      });
    } catch (fallbackError) {
      const lastKnown = lastKnownQuote.get(normalized);

      if (lastKnown) {
        return createSuccessEnvelope("cache", lastKnown, {
          fallbackUsed: true,
          cached: true,
          reason: fallbackError instanceof Error ? fallbackError.message : "Live APIs unavailable"
        });
      }

      throw fallbackError;
    }
  }
}

export async function getUnifiedQuotes(symbols: string[]) {
  const uniqueSymbols = dedupeSymbols(symbols);
  const results = await Promise.allSettled(uniqueSymbols.map((symbol) => getUnifiedQuote(symbol)));

  return results
    .filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getUnifiedQuote>>> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value.data);
}

function indexToMarketIndex(index: LiveIndexSnapshot) {
  return {
    name: index.name,
    value: index.value ?? 0,
    change: index.change ?? 0,
    changePct: index.percentChange ?? 0
  };
}

export async function getMarketOverview(symbols = DEFAULT_SYMBOLS) {
  const cacheKey = `overview:${dedupeSymbols(symbols).join(",")}`;
  const cached = getCached<MarketResponse>(cacheKey);

  if (cached) {
    return createSuccessEnvelope("nse", cached, { cached: true });
  }

  const [indicesResult, quotes] = await Promise.all([
    getNseIndices().then(
      (value) => value.data,
      () => [] as LiveIndexSnapshot[]
    ),
    getUnifiedQuotes(symbols)
  ]);

  const sortedQuotes = [...quotes]
    .filter((quote) => quote.price !== null)
    .sort((left, right) => (right.percentChange ?? -9999) - (left.percentChange ?? -9999));

  const toMover = (quote: NormalizedMarketData) => ({
    symbol: quote.symbol,
    name: quote.symbol,
    price: quote.price ?? 0,
    changePct: quote.percentChange ?? 0,
    volume: quote.volume ?? 0,
    theme: quote.source === "nse" ? "NSE live quote" : "Yahoo fallback"
  });

  const response: MarketResponse = {
    updatedAt: new Date().toISOString(),
    indices: indicesResult.slice(0, 4).map(indexToMarketIndex),
    trending: sortedQuotes.slice(0, 5).map((quote) => ({
      symbol: quote.symbol,
      name: quote.symbol,
      price: quote.price ?? 0,
      changePct: quote.percentChange ?? 0,
      volume: quote.volume ?? 0
    })),
    gainers: sortedQuotes.slice(0, 5).map(toMover),
    losers: [...sortedQuotes]
      .sort((left, right) => (left.percentChange ?? 9999) - (right.percentChange ?? 9999))
      .slice(0, 5)
      .map(toMover),
    candles: [],
    indicators: {
      rsi: 0,
      macd: 0,
      signal: 0
    },
    watchlist: quotes.slice(0, 6).map((quote) => ({
      symbol: quote.symbol,
      name: quote.symbol,
      price: quote.price ?? 0,
      changePct: quote.percentChange ?? 0,
      sparkline: [quote.price ?? 0, quote.price ?? 0, quote.price ?? 0],
      note: quote.source === "nse" ? "NSE" : "Yahoo fallback"
    }))
  };

  return createSuccessEnvelope("nse", setCached(cacheKey, response), {
    cached: false,
    symbols: dedupeSymbols(symbols),
    fallbackCount: quotes.filter((quote) => quote.source === "yahoo").length
  });
}

export async function getPortfolioSnapshot() {
  const quotes = await getUnifiedQuotes(DUMMY_HOLDINGS.map((holding) => holding.symbol));
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const holdings = DUMMY_HOLDINGS.map((holding) => {
    const quote = quoteMap.get(holding.symbol);
    const currentPrice = quote?.price ?? null;
    const investment = holding.quantity * holding.buyPrice;
    const currentValue = currentPrice !== null ? holding.quantity * currentPrice : investment;
    const profitLoss = currentValue - investment;

    return {
      ...holding,
      currentPrice,
      investment,
      currentValue,
      profitLoss,
      returnsPercent: investment > 0 ? (profitLoss / investment) * 100 : 0,
      source: quote?.source ?? "nse",
      timestamp: quote?.timestamp ?? Date.now()
    } satisfies PortfolioHolding;
  });

  const totalInvestment = holdings.reduce((sum, holding) => sum + holding.investment, 0);
  const currentValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
  const profitLoss = currentValue - totalInvestment;
  const snapshot: PortfolioSnapshot = {
    holdings,
    totalInvestment,
    currentValue,
    profitLoss,
    returnsPercent: totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0,
    updatedAt: new Date().toISOString()
  };

  return createSuccessEnvelope("nse", snapshot, {
    cached: false,
    note: "Dummy portfolio with live market prices"
  });
}

export function listSupportedSymbols() {
  return DEFAULT_SYMBOLS;
}
