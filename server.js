require("dotenv").config();

const express = require("express");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DHAN_BASE_URL = normalizeBaseUrl(process.env.DHAN_BASE_URL || "https://sandbox.dhan.co/v2");
const DHAN_ACCESS_TOKEN = process.env.DHAN_ACCESS_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "openchat:7b";
const CACHE_TTL_MS = 5_000;

const cache = new Map();

app.use(express.json({ limit: "128kb" }));

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/[\\/]+$/, "");
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireDhanToken() {
  if (!DHAN_ACCESS_TOKEN) {
    throw new ApiError(500, "Dhan access token is not configured.");
  }
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function cacheKey(prefix, payload) {
  return `${prefix}:${JSON.stringify(payload)}`;
}

function getCached(key) {
  const entry = cache.get(key);

  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return value;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function pickLatest(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = asNumber(values[index]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function compactNumberArray(values) {
  return Array.isArray(values)
    ? values.map(asNumber).filter((value) => value !== null)
    : [];
}

function readAny(record, keys) {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeIntraday(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const closeSeries = compactNumberArray(readAny(source, ["close", "closePrice", "c"]));
  const openSeries = compactNumberArray(readAny(source, ["open", "openPrice", "o"]));
  const highSeries = compactNumberArray(readAny(source, ["high", "highPrice", "h"]));
  const lowSeries = compactNumberArray(readAny(source, ["low", "lowPrice", "l"]));
  const volumeSeries = compactNumberArray(readAny(source, ["volume", "volumes", "v"]));
  const price =
    pickLatest(closeSeries) ??
    asNumber(readAny(source, ["ltp", "lastPrice", "lastTradedPrice", "price"]));

  if (price === null) {
    throw new ApiError(500, "Dhan intraday response is empty or missing price data.");
  }

  return {
    price,
    open: pickLatest(openSeries),
    high: pickLatest(highSeries),
    low: pickLatest(lowSeries),
    volume: pickLatest(volumeSeries),
    closeSeries
  };
}

function normalizeHolding(item) {
  const quantity =
    asNumber(readAny(item, ["totalQty", "netQty", "availableQty", "quantity"])) ?? 0;
  const ltp =
    asNumber(readAny(item, ["lastTradedPrice", "ltp", "currentPrice"])) ??
    asNumber(readAny(item, ["avgCostPrice", "buyAvg", "avgPrice"])) ??
    0;
  const avgPrice =
    asNumber(readAny(item, ["avgCostPrice", "buyAvg", "avgPrice"])) ?? 0;
  const investedValue =
    asNumber(readAny(item, ["investedValue", "dayBuyValue"])) ?? quantity * avgPrice;
  const currentValue =
    asNumber(readAny(item, ["currentValue", "marketValue"])) ?? quantity * ltp;
  const pnl =
    asNumber(readAny(item, ["unrealizedProfit", "pnl", "profitLoss"])) ??
    currentValue - investedValue;

  return {
    symbol: readAny(item, ["tradingSymbol", "symbol", "securityId"]) || "UNKNOWN",
    quantity,
    avgPrice,
    ltp,
    currentValue,
    pnl
  };
}

async function dhanRequest(path, options = {}) {
  requireDhanToken();

  const response = await fetch(`${DHAN_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "access-token": DHAN_ACCESS_TOKEN
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 10_000)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(500, "Dhan authentication failed. Check DHAN_ACCESS_TOKEN.");
    }

    const text = await response.text();
    throw new ApiError(500, text || `Dhan API failed with status ${response.status}.`);
  }

  const data = await response.json();

  if (data === null || data === undefined) {
    throw new ApiError(500, "Dhan API returned an empty response.");
  }

  return data;
}

async function getIntradayData(input) {
  const body = {
    securityId: input.securityId,
    exchangeSegment: input.exchangeSegment || "NSE_EQ"
  };
  const key = cacheKey("intraday", body);
  const cached = getCached(key);

  if (cached) {
    return cached;
  }

  const payload = await dhanRequest("/charts/intraday", {
    method: "POST",
    body
  });
  const normalized = normalizeIntraday(payload);

  return setCached(key, normalized);
}

function calculateAverage(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function generateSignal(intraday) {
  const average = calculateAverage(intraday.closeSeries);

  if (average === null) {
    throw new ApiError(500, "Not enough intraday data to calculate moving average.");
  }

  const signal = intraday.price >= average ? "BUY" : "SELL";

  return {
    signal,
    reason: `price ${intraday.price} is ${signal === "BUY" ? "above" : "below"} moving average ${average.toFixed(2)}`,
    average
  };
}

async function callOllama(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new ApiError(500, `Ollama failed with status ${response.status}.`);
  }

  const data = await response.json();
  const text = typeof data.response === "string" ? data.response.trim() : "";

  if (!text) {
    throw new ApiError(500, "Ollama returned an empty response.");
  }

  return text;
}

app.get("/health", (_req, res) => {
  res.status(200).send("API running");
});

app.post(
  "/market/intraday",
  asyncHandler(async (req, res) => {
    const { securityId, exchangeSegment = "NSE_EQ" } = req.body || {};
    const normalizedSecurityId = requireText(securityId, "securityId");
    const normalizedExchangeSegment = requireText(exchangeSegment, "exchangeSegment");

    const intraday = await getIntradayData({
      securityId: normalizedSecurityId,
      exchangeSegment: normalizedExchangeSegment
    });

    res.status(200).json({
      price: intraday.price,
      open: intraday.open,
      high: intraday.high,
      low: intraday.low,
      volume: intraday.volume
    });
  })
);

app.get(
  "/portfolio",
  asyncHandler(async (_req, res) => {
    const payload = await dhanRequest("/holdings");
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
    const stocks = rows.map(normalizeHolding);
    const totalValue = stocks.reduce((sum, item) => sum + item.currentValue, 0);
    const pnl = stocks.reduce((sum, item) => sum + item.pnl, 0);

    res.status(200).json({
      stocks,
      totalValue,
      pnl
    });
  })
);

app.post(
  "/signal",
  asyncHandler(async (req, res) => {
    const { securityId, exchangeSegment = "NSE_EQ" } = req.body || {};
    const normalizedSecurityId = requireText(securityId, "securityId");
    const normalizedExchangeSegment = requireText(exchangeSegment, "exchangeSegment");

    const intraday = await getIntradayData({
      securityId: normalizedSecurityId,
      exchangeSegment: normalizedExchangeSegment
    });
    const signal = generateSignal(intraday);

    res.status(200).json({
      signal: signal.signal,
      reason: signal.reason
    });
  })
);

app.post(
  "/ai/analyze",
  asyncHandler(async (req, res) => {
    try {
      const { stock, securityId, exchangeSegment = "NSE_EQ" } = req.body || {};
      const normalizedStock = requireText(stock, "stock");
      const normalizedSecurityId = requireText(securityId, "securityId");
      const normalizedExchangeSegment = requireText(exchangeSegment, "exchangeSegment");

      const intraday = await getIntradayData({
        securityId: normalizedSecurityId,
        exchangeSegment: normalizedExchangeSegment
      });
      const signal = generateSignal(intraday);
      const trend = signal.signal === "BUY" ? "bullish" : "bearish";
      const prompt = [
        `Stock: ${normalizedStock}`,
        `Price: ${intraday.price}`,
        `Trend: ${trend}`,
        `Signal: ${signal.signal}`,
        "Explain in simple terms."
      ].join("\n");
      const analysis = await callOllama(prompt);

      res.status(200).json({
        stock: normalizedStock,
        analysis
      });
    } catch (error) {
      const status = error instanceof ApiError && error.status === 400 ? 400 : 500;
      const details = error instanceof Error ? error.message : "Server error.";

      console.error(details);

      res.status(status).json(
        status === 400
          ? { error: details }
          : {
              error: "Backend failed",
              details
            }
      );
    }
  })
);

app.use((error, _req, res, _next) => {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Server error.";

  res.status(status).json({
    error: message
  });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`API running on ${HOST}:${PORT}`);
  });
}

module.exports = app;
