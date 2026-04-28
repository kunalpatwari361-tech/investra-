import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import {
  getMfErrorMessage,
  getMutualFundHistory,
  getMutualFundLatestNav,
  searchMutualFunds
} from "@/lib/services/mfService";
import {
  getNseIndices,
  getNseQuote
} from "@/lib/services/stockService";
import { getYahooChart } from "@/lib/services/chartService";

type QueryKind = "stock" | "mutual_fund" | "index";

type FinancialJsonResponse = {
  summary: string;
  live_data: {
    price: string;
    change: string;
    volume: string;
    market_status: string;
  };
  fundamentals: {
    pe_ratio: string;
    eps: string;
    market_cap: string;
    revenue: string;
    profit: string;
  };
  trend_analysis: {
    short_term: string;
    long_term: string;
  };
  ai_insight: string;
  risk_level: string;
  data_source: string[];
  disclaimer: string;
};

type YahooChartMeta = {
  symbol?: string;
  longName?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  regularMarketVolume?: number;
  exchangeName?: string;
  instrumentType?: string;
  currentTradingPeriod?: {
    regular?: {
      end?: number;
      start?: number;
    };
  };
};

type YahooChartResult = {
  meta?: YahooChartMeta;
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

type MutualFundPoint = {
  date: string;
  nav: number;
};

type MutualFundLatestResponse = {
  meta?: {
    scheme_code?: number;
    scheme_name?: string;
    fund_house?: string;
    scheme_category?: string;
  };
  data?: Array<{
    date?: string;
    nav?: string;
  }>;
  status?: string;
};

type MutualFundHistoryResponse = {
  meta?: {
    scheme_code?: number;
    scheme_name?: string;
    fund_house?: string;
    scheme_category?: string;
  };
  data?: Array<{
    date?: string;
    nav?: string;
  }>;
  status?: string;
};

const UNAVAILABLE = "Data not available";

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

function formatCurrency(value: number | null) {
  if (value === null) {
    return UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatPlainNumber(value: number | null, fractionDigits = 2) {
  if (value === null) {
    return UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return UNAVAILABLE;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompactCurrency(value: number | null) {
  if (value === null) {
    return UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function formatVolume(value: number | null) {
  if (value === null) {
    return UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function parseDdMmYyyy(value: string) {
  const [day, month, year] = value.split("-").map((part) => Number(part));

  if (!day || !month || !year) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectQueryKind(input: string): QueryKind | null {
  const normalized = input.toLowerCase();

  if (/\bmutual fund|nav|scheme|sip|amc|fund house\b/i.test(normalized)) {
    return "mutual_fund";
  }

  if (/\bnifty|sensex|bank nifty|index|indices\b/i.test(normalized)) {
    return "index";
  }

  if (/\bstock|share|price|volume|market cap|pe ratio|eps|reliance|tcs|infosys|hdfc|icici\b/i.test(normalized)) {
    return "stock";
  }

  return null;
}

function detectSymbol(input: string) {
  const normalized = input.toUpperCase();

  if (normalized.includes("BANK NIFTY") || normalized.includes("BANKNIFTY")) {
    return "BANKNIFTY";
  }

  if (normalized.includes("SENSEX")) {
    return "SENSEX";
  }

  if (normalized.includes("NIFTY")) {
    return "NIFTY";
  }

  const cleaned = normalized
    .replace(/\b(STOCK|SHARE|PRICE|QUOTE|ANALYSIS|VOLUME|MARKET|CAP|PE|RATIO|EPS|OF|FOR|THE|LATEST|TODAY|INDIA|NSE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.match(/\b[A-Z][A-Z0-9&.-]{1,14}\b/g) ?? [];

  return tokens[0] ?? cleaned.split(" ")[0] ?? "";
}

function detectIndexName(input: string) {
  const normalized = input.toUpperCase();

  if (normalized.includes("BANK NIFTY") || normalized.includes("BANKNIFTY")) {
    return "NIFTY BANK";
  }

  if (normalized.includes("SENSEX")) {
    return "SENSEX";
  }

  return "NIFTY 50";
}

async function fetchNseQuote(symbol: string) {
  try {
    const payload = await getNseQuote(symbol);

    return {
      ok: true as const,
      price: payload.data.price,
      change: payload.data.change,
      percentChange: payload.data.percentChange,
      volume: payload.data.volume
    };
  } catch (error) {
    logDebugError(error, `financial-json.fetchNseQuote.${symbol}`);
    return {
      ok: false as const,
      error: getErrorMessage(error, "NSE data unavailable.")
    };
  }
}

async function fetchNseIndices() {
  try {
    const payload = await getNseIndices();

    return {
      ok: true as const,
      indices: payload.data.map((entry) => ({
        name: entry.name.toUpperCase(),
        value: entry.value,
        change: entry.change,
        percentChange: entry.percentChange
      }))
    };
  } catch (error) {
    logDebugError(error, "financial-json.fetchNseIndices");
    return {
      ok: false as const,
      error: getErrorMessage(error, "NSE indices unavailable.")
    };
  }
}

async function fetchYahooChart(symbol: string, range: string, interval: string) {
  try {
    const payload = await getYahooChart(symbol, range, interval);
    const lastPoint = payload.data.chartData[payload.data.chartData.length - 1];
    const firstPoint = payload.data.chartData[0];
    const result: YahooChartResult = {
      meta: {
        regularMarketPrice: lastPoint?.close,
        previousClose:
          firstPoint?.close ?? undefined,
        exchangeName: payload.data.exchangeName ?? undefined,
        longName: payload.data.longName ?? undefined
      },
      timestamp: payload.data.chartData.map((point) => point.time),
      indicators: {
        quote: [
          {
            open: payload.data.chartData.map((point) => point.open),
            high: payload.data.chartData.map((point) => point.high),
            low: payload.data.chartData.map((point) => point.low),
            close: payload.data.chartData.map((point) => point.close),
            volume: []
          }
        ]
      }
    };

    return {
      ok: true as const,
      result
    };
  } catch (error) {
    logDebugError(error, `financial-json.fetchYahooChart.${symbol}.${range}`);
    return {
      ok: false as const,
      error: getErrorMessage(error, "Yahoo Finance data unavailable.")
    };
  }
}

async function fetchYahooFundamentals(symbol: string) {
  return {
    ok: false as const,
    error: "Fundamentals are not enabled because Yahoo is reserved for chart data only.",
    peRatio: UNAVAILABLE,
    eps: UNAVAILABLE,
    marketCap: UNAVAILABLE,
    revenue: UNAVAILABLE,
    profit: UNAVAILABLE
  };
}

function collectClosingSeries(result: YahooChartResult) {
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function determineShortTermTrend(currentPrice: number | null, previousClose: number | null, closes: number[]) {
  if (currentPrice === null || previousClose === null) {
    return UNAVAILABLE;
  }

  const intradayMove = ((currentPrice - previousClose) / previousClose) * 100;
  const start = closes[0] ?? previousClose;
  const end = closes[closes.length - 1] ?? currentPrice;
  const sessionMove = start ? ((end - start) / start) * 100 : intradayMove;

  if (intradayMove > 1.5 || sessionMove > 1.5) {
    return "Bullish intraday momentum";
  }

  if (intradayMove < -1.5 || sessionMove < -1.5) {
    return "Bearish intraday momentum";
  }

  return "Range-bound short-term movement";
}

function determineLongTermTrend(series: number[]) {
  const first = series[0] ?? null;
  const last = series[series.length - 1] ?? null;

  if (first === null || last === null || first === 0) {
    return UNAVAILABLE;
  }

  const move = ((last - first) / first) * 100;

  if (move > 15) {
    return "Positive long-term trend";
  }

  if (move < -15) {
    return "Negative long-term trend";
  }

  return "Neutral to sideways long-term trend";
}

function determineRiskLevel(args: {
  percentChange: number | null;
  volume: number | null;
  peRatio?: string;
}) {
  const pe = safeNumber(args.peRatio);

  if ((args.percentChange !== null && Math.abs(args.percentChange) >= 4) || (pe !== null && pe > 45)) {
    return "High";
  }

  if ((args.percentChange !== null && Math.abs(args.percentChange) >= 2) || (pe !== null && pe > 25)) {
    return "Moderate";
  }

  if (args.percentChange !== null || pe !== null || args.volume !== null) {
    return "Low";
  }

  return UNAVAILABLE;
}

async function buildStockResponse(input: string): Promise<FinancialJsonResponse> {
  const symbol = detectSymbol(input);
  const dataSources: string[] = [];
  const nse = symbol ? await fetchNseQuote(symbol) : { ok: false as const, error: "Symbol not found." };
  const yahooIntraday = symbol ? await fetchYahooChart(symbol, "1d", "1m") : { ok: false as const, error: "Symbol not found." };
  const yahooLongTerm = symbol ? await fetchYahooChart(symbol, "1y", "1d") : { ok: false as const, error: "Symbol not found." };
  const fundamentals = symbol
    ? await fetchYahooFundamentals(symbol)
    : {
        ok: false as const,
        error: "Symbol not found.",
        peRatio: UNAVAILABLE,
        eps: UNAVAILABLE,
        marketCap: UNAVAILABLE,
        revenue: UNAVAILABLE,
        profit: UNAVAILABLE
      };

  if (nse.ok) {
    dataSources.push("NSE");
  }

  if (yahooIntraday.ok || yahooLongTerm.ok || fundamentals.ok) {
    dataSources.push("Yahoo");
  }

  const intradayMeta = yahooIntraday.ok ? yahooIntraday.result.meta ?? {} : {};
  const intradaySeries = yahooIntraday.ok ? collectClosingSeries(yahooIntraday.result) : [];
  const longTermSeries = yahooLongTerm.ok ? collectClosingSeries(yahooLongTerm.result) : [];
  const nsePrice = nse.ok ? nse.price : null;
  const livePrice = nsePrice;
  const previousClose = safeNumber(intradayMeta.previousClose);
  const liveChange =
    nse.ok && nse.change !== null ? nse.change : null;
  const livePercentChange =
    nse.ok && nse.percentChange !== null ? nse.percentChange : null;
  const liveVolume = nse.ok && nse.volume !== null ? nse.volume : null;
  const marketStatus = nse.ok ? "Latest available from NSE" : UNAVAILABLE;

  return {
    summary:
      livePrice !== null
        ? `${intradayMeta.longName ?? symbol} is trading at ${formatCurrency(livePrice)} with a move of ${formatPercent(livePercentChange)}.`
        : `Latest stock price for ${symbol || "the requested stock"} is ${UNAVAILABLE}.`,
    live_data: {
      price: formatCurrency(livePrice),
      change:
        liveChange !== null && livePercentChange !== null
          ? `${formatCurrency(liveChange)} (${formatPercent(livePercentChange)})`
          : UNAVAILABLE,
      volume: formatVolume(liveVolume),
      market_status: marketStatus
    },
    fundamentals: {
      pe_ratio: fundamentals.ok ? fundamentals.peRatio : UNAVAILABLE,
      eps: fundamentals.ok ? fundamentals.eps : UNAVAILABLE,
      market_cap: fundamentals.ok ? fundamentals.marketCap : UNAVAILABLE,
      revenue: fundamentals.ok ? fundamentals.revenue : UNAVAILABLE,
      profit: fundamentals.ok ? fundamentals.profit : UNAVAILABLE
    },
    trend_analysis: {
      short_term: determineShortTermTrend(livePrice, previousClose, intradaySeries),
      long_term: determineLongTermTrend(longTermSeries)
    },
    ai_insight:
      livePrice !== null
        ? `The stock is being evaluated using NSE live quote data and Yahoo chart trend data. Price action suggests ${determineRiskLevel({
            percentChange: livePercentChange,
            volume: liveVolume,
            peRatio: undefined
          }).toLowerCase()} risk conditions for short-term traders.`
        : "Live stock data could not be established from the configured sources, so no price-based inference should be treated as reliable.",
    risk_level: determineRiskLevel({
      percentChange: livePercentChange,
      volume: liveVolume,
      peRatio: fundamentals.ok ? fundamentals.peRatio : undefined
    }),
      data_source: dataSources.length ? dataSources : ["NSE", "Yahoo"],
    disclaimer: "This is for educational purposes only"
  };
}

async function resolveMutualFund(input: string) {
  const schemeCodeMatch = input.match(/\b\d{5,}\b/);

  if (schemeCodeMatch) {
    return {
      schemeCode: Number(schemeCodeMatch[0]),
      schemeName: schemeCodeMatch[0]
    };
  }

  const query = input
    .replace(/\b(mutual fund|nav|scheme|sip|amc|history|latest|show|price|of|for|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = (await searchMutualFunds(query || input)).data;

  return matches[0] ?? null;
}

async function fetchMutualFundLatest(code: number) {
  const payload = await getMutualFundLatestNav(code);

  return {
    meta: {
      scheme_code: payload.data.schemeCode,
      scheme_name: payload.data.schemeName,
      fund_house: payload.data.fundHouse,
      scheme_category: payload.data.schemeCategory
    },
    data: [
      {
        date: payload.data.date,
        nav: payload.data.nav
      }
    ]
  } satisfies MutualFundLatestResponse;
}

async function fetchMutualFundHistory(code: number) {
  const payload = await getMutualFundHistory(code);

  return {
    meta: {
      scheme_code: payload.data.schemeCode,
      scheme_name: payload.data.schemeName,
      fund_house: payload.data.fundHouse,
      scheme_category: payload.data.schemeCategory
    },
    data: payload.data.points.map((point) => ({
      date: point.date,
      nav: point.nav
    }))
  } satisfies MutualFundHistoryResponse;
}

function normalizeMutualFundPoints(payload: MutualFundHistoryResponse) {
  return (payload.data ?? [])
    .map((point) => {
      const nav = safeNumber(point.nav);
      const parsedDate = typeof point.date === "string" ? parseDdMmYyyy(point.date) : null;

      return nav !== null && point.date && parsedDate
        ? {
            date: point.date,
            nav,
            parsedDate
          }
        : null;
    })
    .filter(
      (point): point is MutualFundPoint & { parsedDate: Date } => Boolean(point)
    );
}

function findOneYearPoint(points: Array<MutualFundPoint & { parsedDate: Date }>) {
  if (!points.length) {
    return null;
  }

  const latestDate = points[0].parsedDate.getTime();
  const target = latestDate - 365 * 24 * 60 * 60 * 1000;

  return (
    points.find((point) => point.parsedDate.getTime() <= target) ?? points[points.length - 1] ?? null
  );
}

async function buildMutualFundResponse(input: string): Promise<FinancialJsonResponse> {
  try {
    const match = await resolveMutualFund(input);

    if (!match) {
      return {
        summary: "Mutual fund scheme could not be resolved from the query.",
        live_data: {
          price: UNAVAILABLE,
          change: UNAVAILABLE,
          volume: UNAVAILABLE,
          market_status: UNAVAILABLE
        },
        fundamentals: {
          pe_ratio: UNAVAILABLE,
          eps: UNAVAILABLE,
          market_cap: UNAVAILABLE,
          revenue: UNAVAILABLE,
          profit: UNAVAILABLE
        },
        trend_analysis: {
          short_term: UNAVAILABLE,
          long_term: UNAVAILABLE
        },
      ai_insight: "A scheme code or a more specific scheme name is required for a reliable mutual fund response.",
      risk_level: UNAVAILABLE,
      data_source: ["MFAPI"],
        disclaimer: "This is for educational purposes only"
      };
    }

    const latest = await fetchMutualFundLatest(match.schemeCode);
    const history = await fetchMutualFundHistory(match.schemeCode);
    const latestEntry = latest.data?.[0];
    const latestNav = safeNumber(latestEntry?.nav);
    const points = normalizeMutualFundPoints(history);
    const previousPoint = points[1] ?? null;
    const oneYearPoint = findOneYearPoint(points);
    const oneDayReturn =
      latestNav !== null && previousPoint && previousPoint.nav !== 0
        ? ((latestNav - previousPoint.nav) / previousPoint.nav) * 100
        : null;
    const oneYearReturn =
      latestNav !== null && oneYearPoint && oneYearPoint.nav !== 0
        ? ((latestNav - oneYearPoint.nav) / oneYearPoint.nav) * 100
        : null;

    return {
      summary:
        latestNav !== null
          ? `${latest.meta?.scheme_name ?? match.schemeName} latest NAV is ${formatCurrency(latestNav)} as of ${latestEntry?.date ?? UNAVAILABLE}.`
          : `Latest NAV for ${latest.meta?.scheme_name ?? match.schemeName} is ${UNAVAILABLE}.`,
      live_data: {
        price:
          latestNav !== null ? `NAV ${formatCurrency(latestNav)}` : UNAVAILABLE,
        change:
          oneDayReturn !== null ? `1-day return ${formatPercent(oneDayReturn)}` : UNAVAILABLE,
        volume: UNAVAILABLE,
        market_status: latestEntry?.date
          ? `Latest available NAV dated ${latestEntry.date}`
          : UNAVAILABLE
      },
      fundamentals: {
        pe_ratio: UNAVAILABLE,
        eps: UNAVAILABLE,
        market_cap: UNAVAILABLE,
        revenue: UNAVAILABLE,
        profit: UNAVAILABLE
      },
      trend_analysis: {
        short_term:
          oneDayReturn !== null
            ? `1-day NAV movement is ${formatPercent(oneDayReturn)}`
            : UNAVAILABLE,
        long_term:
          oneYearReturn !== null
            ? `1-year NAV return is ${formatPercent(oneYearReturn)}`
            : UNAVAILABLE
      },
      ai_insight:
        oneYearReturn !== null
          ? `The fund shows a ${oneYearReturn >= 0 ? "positive" : "negative"} 1-year NAV trend. NAV should be interpreted as unit value, not as a direct stock-style trading signal.`
          : "Live NAV data is available, but the available history is not sufficient to compute a reliable 1-year return.",
      risk_level:
        oneYearReturn === null
          ? UNAVAILABLE
          : oneYearReturn < -10
            ? "High"
            : oneYearReturn < 5
              ? "Moderate"
              : "Low",
      data_source: ["MFAPI"],
      disclaimer: "This is for educational purposes only"
    };
  } catch (error) {
    logDebugError(error, "financial-json.buildMutualFundResponse");

    return {
      summary: "Latest mutual fund data could not be fetched.",
      live_data: {
        price: UNAVAILABLE,
        change: UNAVAILABLE,
        volume: UNAVAILABLE,
        market_status: UNAVAILABLE
      },
      fundamentals: {
        pe_ratio: UNAVAILABLE,
        eps: UNAVAILABLE,
        market_cap: UNAVAILABLE,
        revenue: UNAVAILABLE,
        profit: UNAVAILABLE
      },
      trend_analysis: {
        short_term: UNAVAILABLE,
        long_term: UNAVAILABLE
      },
      ai_insight: getMfErrorMessage(error),
      risk_level: UNAVAILABLE,
      data_source: ["MFAPI"],
      disclaimer: "This is for educational purposes only"
    };
  }
}

async function buildIndexResponse(input: string): Promise<FinancialJsonResponse> {
  const requestedIndex = detectIndexName(input).toUpperCase();
  const indices = await fetchNseIndices();
  const matched =
    indices.ok
      ? indices.indices.find((item) => item.name.includes(requestedIndex))
      : null;

  return {
    summary:
      matched && matched.value !== null
        ? `${requestedIndex} is at ${formatPlainNumber(matched.value, 2)} with a move of ${formatPercent(matched.percentChange)}.`
        : `Latest available data for ${requestedIndex} is ${UNAVAILABLE}.`,
    live_data: {
      price: matched?.value !== null && matched?.value !== undefined ? formatPlainNumber(matched.value, 2) : UNAVAILABLE,
      change:
        matched?.change !== null && matched?.change !== undefined && matched?.percentChange !== null && matched?.percentChange !== undefined
          ? `${formatPlainNumber(matched.change, 2)} (${formatPercent(matched.percentChange)})`
          : UNAVAILABLE,
      volume: UNAVAILABLE,
      market_status: indices.ok ? "Latest available from NSE indices API" : UNAVAILABLE
    },
    fundamentals: {
      pe_ratio: UNAVAILABLE,
      eps: UNAVAILABLE,
      market_cap: UNAVAILABLE,
      revenue: UNAVAILABLE,
      profit: UNAVAILABLE
    },
    trend_analysis: {
      short_term:
        matched?.percentChange !== null && matched?.percentChange !== undefined
          ? matched.percentChange > 0
            ? "Positive short-term index movement"
            : matched.percentChange < 0
              ? "Negative short-term index movement"
              : "Flat short-term movement"
          : UNAVAILABLE,
      long_term: UNAVAILABLE
    },
    ai_insight:
      matched && matched.percentChange !== null
        ? `${requestedIndex} reflects the current market tone, but index movement alone is not enough to judge individual stocks or sectors.`
        : "Index data is not available from the configured NSE endpoint at the moment.",
    risk_level:
      matched?.percentChange !== null && matched?.percentChange !== undefined
        ? Math.abs(matched.percentChange) >= 2
          ? "High"
          : Math.abs(matched.percentChange) >= 1
            ? "Moderate"
            : "Low"
        : UNAVAILABLE,
    data_source: ["NSE"],
    disclaimer: "This is for educational purposes only"
  };
}

export async function getFinancialJsonResponse(
  input: string
): Promise<FinancialJsonResponse | null> {
  const queryKind = detectQueryKind(input);

  if (!queryKind) {
    return null;
  }

  if (queryKind === "stock") {
    return buildStockResponse(input);
  }

  if (queryKind === "mutual_fund") {
    return buildMutualFundResponse(input);
  }

  if (queryKind === "index") {
    return buildIndexResponse(input);
  }

  return null;
}
