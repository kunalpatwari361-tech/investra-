import type { LiveIndexSnapshot, LiveMarketQuote, MarketResponse } from "@/types/finance";
import { createSuccessEnvelope } from "@/lib/services/api-utils";
import { getApiErrorMessage } from "@/lib/error-utils";

const NSE_WEB_BASE_URL = "https://www.nseindia.com";
const NSE_API_BASE_URL =
  process.env.NSE_INDIA_API_BASE_URL ?? `${NSE_WEB_BASE_URL.replace(/\/+$/, "")}/api`;
const NSE_TIMEOUT_MS = 10_000;
const NSE_COOKIE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "INFY",
  "HDFCBANK",
  "ICICIBANK",
  "SBIN",
  "LT",
  "ITC"
];

const NSE_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${NSE_WEB_BASE_URL}/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
};

type NseCookieCache = {
  value: string;
  expiresAt: number;
};

let nseCookieCache: NseCookieCache | null = null;

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.NS$/, "");
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readPath(source: unknown, path: string[]) {
  let current = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = safeNumber(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getSetCookie(headers: Headers) {
  const typedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = typedHeaders.getSetCookie?.() ?? [];
  const fallback = headers.get("set-cookie");

  if (cookies.length) {
    return cookies;
  }

  return fallback ? [fallback] : [];
}

async function getNseCookie() {
  if (nseCookieCache && nseCookieCache.expiresAt > Date.now()) {
    return nseCookieCache.value;
  }

  const response = await fetch(NSE_WEB_BASE_URL, {
    cache: "no-store",
    headers: NSE_HEADERS,
    signal: AbortSignal.timeout(NSE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, "NSE cookie bootstrap failed"));
  }

  const cookie = getSetCookie(response.headers)
    .map((entry) => entry.split(";")[0])
    .filter(Boolean)
    .join("; ");

  nseCookieCache = {
    value: cookie,
    expiresAt: Date.now() + NSE_COOKIE_TTL_MS
  };

  return cookie;
}

async function fetchNseApi<T>(path: string) {
  const startedAt = Date.now();
  const cookie = await getNseCookie();
  const response = await fetch(`${NSE_API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      ...NSE_HEADERS,
      "Cache-Control": "no-cache",
      ...(cookie ? { Cookie: cookie } : {})
    },
    signal: AbortSignal.timeout(NSE_TIMEOUT_MS)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      nseCookieCache = null;
    }

    throw new Error(await getApiErrorMessage(response, "NSE API request failed"));
  }

  return {
    data: (await response.json()) as T,
    durationMs: Date.now() - startedAt
  };
}

function parseNseQuote(symbol: string, data: unknown): LiveMarketQuote {
  return {
    symbol,
    price: firstNumber(
      readPath(data, ["priceInfo", "lastPrice"]),
      readPath(data, ["priceInfo", "lastPriceInr"]),
      readPath(data, ["info", "lastPrice"]),
      readPath(data, ["lastPrice"])
    ),
    change: firstNumber(
      readPath(data, ["priceInfo", "change"]),
      readPath(data, ["info", "change"]),
      readPath(data, ["change"])
    ),
    percentChange: firstNumber(
      readPath(data, ["priceInfo", "pChange"]),
      readPath(data, ["info", "pChange"]),
      readPath(data, ["pChange"])
    ),
    volume: firstNumber(
      readPath(data, ["preOpenMarket", "totalTradedVolume"]),
      readPath(data, ["securityWiseDP", "quantityTraded"]),
      readPath(data, ["marketDeptOrderBook", "tradeInfo", "totalTradedVolume"]),
      readPath(data, ["totalTradedVolume"])
    )
  };
}

function parseIndexRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const nestedRows =
    readPath(payload, ["data"]) ??
    readPath(payload, ["marketState"]) ??
    readPath(payload, ["indices"]) ??
    [];

  return Array.isArray(nestedRows) ? nestedRows : [];
}

function parseNseIndices(payload: unknown) {
  return parseIndexRows(payload)
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name =
        (typeof record.index === "string" && record.index) ||
        (typeof record.indexName === "string" && record.indexName) ||
        (typeof record.name === "string" && record.name) ||
        "";

      if (!name) {
        return null;
      }

      return {
        name,
        value: firstNumber(record.last, record.value, record.indexValue, record.price),
        change: firstNumber(record.variation, record.change, record.pointsChange),
        percentChange: firstNumber(record.percentChange, record.pChange, record.percent)
      } satisfies LiveIndexSnapshot;
    })
    .filter((item): item is LiveIndexSnapshot => Boolean(item));
}

export async function getNseQuote(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const { data, durationMs } = await fetchNseApi<unknown>(
    `/quote-equity?symbol=${encodeURIComponent(normalized)}`
  );
  const quote = parseNseQuote(normalized, data);

  if (quote.price === null) {
    throw new Error("NSE quote response is missing price data.");
  }

  return createSuccessEnvelope("nse", quote, {
    durationMs,
    endpoint: "/quote-equity"
  });
}

export async function getStockQuote(symbol: string) {
  return getNseQuote(symbol);
}

export async function getNseIndices() {
  const { data, durationMs } = await fetchNseApi<unknown>("/marketStatus");

  return createSuccessEnvelope("nse", parseNseIndices(data), {
    durationMs,
    endpoint: "/marketStatus"
  });
}

export async function getNseMarketStatus() {
  const { data, durationMs } = await fetchNseApi<unknown>("/marketStatus");

  return createSuccessEnvelope("nse", data, {
    durationMs,
    endpoint: "/marketStatus"
  });
}

export async function getNseOptionChain(symbol = "NIFTY") {
  const normalized = normalizeSymbol(symbol);
  const { data, durationMs } = await fetchNseApi<unknown>(
    `/option-chain-indices?symbol=${encodeURIComponent(normalized)}`
  );

  return createSuccessEnvelope("nse", data, {
    durationMs,
    endpoint: "/option-chain-indices"
  });
}

export async function getDashboardMarketSnapshot(symbols = DEFAULT_SYMBOLS) {
  const [indicesResult, quoteResults] = await Promise.all([
    getNseIndices().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error })
    ),
    Promise.allSettled(symbols.map((symbol) => getStockQuote(symbol)))
  ]);

  const quoteEnvelopes = quoteResults
    .filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getStockQuote>>> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value);

  const indices = indicesResult.ok ? indicesResult.value.data : [];
  const sortedQuotes = [...quoteEnvelopes]
    .map((envelope) => envelope.data)
    .filter((quote) => quote.price !== null)
    .sort((left, right) => (right.percentChange ?? -9999) - (left.percentChange ?? -9999));

  const toMover = (quote: LiveMarketQuote) => ({
    symbol: quote.symbol,
    name: quote.symbol,
    price: quote.price ?? 0,
    changePct: quote.percentChange ?? 0,
    volume: quote.volume ?? 0,
    theme: "NSE live quote"
  });

  const response: MarketResponse = {
    updatedAt: new Date().toISOString(),
    indices: indices.slice(0, 4).map((index) => ({
      name: index.name,
      value: index.value ?? 0,
      change: index.change ?? 0,
      changePct: index.percentChange ?? 0
    })),
    trending: sortedQuotes.slice(0, 3).map((quote) => ({
      symbol: quote.symbol,
      name: quote.symbol,
      price: quote.price ?? 0,
      changePct: quote.percentChange ?? 0,
      volume: quote.volume ?? 0
    })),
    gainers: sortedQuotes.slice(0, 3).map(toMover),
    losers: [...sortedQuotes]
      .sort((left, right) => (left.percentChange ?? 9999) - (right.percentChange ?? 9999))
      .slice(0, 3)
      .map(toMover),
    candles: [],
    indicators: {
      rsi: 0,
      macd: 0,
      signal: 0
    },
    watchlist: quoteEnvelopes.slice(0, 5).map((envelope) => ({
      symbol: envelope.data.symbol,
      name: envelope.data.symbol,
      price: envelope.data.price ?? 0,
      changePct: envelope.data.percentChange ?? 0,
      sparkline: [
        envelope.data.price ?? 0,
        envelope.data.price ?? 0,
        envelope.data.price ?? 0
      ],
      note: "LIVE NSE quote"
    }))
  };

  return createSuccessEnvelope("nse", response, {
    symbols,
    quoteCalls: quoteEnvelopes.length,
    failedQuoteCount: quoteResults.length - quoteEnvelopes.length,
    indicesAvailable: indicesResult.ok
  });
}
