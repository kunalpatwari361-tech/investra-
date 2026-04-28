import { getMarketData } from "@/lib/data-access";
import { getPortfolioSnapshot } from "@/lib/services/marketDataService";
import {
  getMutualFundHistory,
  getMutualFundLatestNav,
  searchMutualFunds
} from "@/lib/services/mfService";
import { handleQuery } from "@/lib/model-router";
import { logDebugError } from "@/lib/error-utils";
import type { QueryResponse } from "@/types/chat";
import type { ModelAnswer, ModelProvider } from "@/types/model";

const SYMBOL_STOP_WORDS = new Set([
  "BUY",
  "SELL",
  "HOLD",
  "WHAT",
  "SHOULD",
  "PRICE",
  "STOCK",
  "SHARE",
  "MARKET",
  "ANALYZE",
  "ANALYSIS",
  "TODAY",
  "PLEASE",
  "TELL"
]);

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

  const tokens = normalized.match(/\b[A-Z]{2,15}\b/g) ?? [];
  return tokens.find((token) => !SYMBOL_STOP_WORDS.has(token)) ?? null;
}

function isPortfolioQuery(input: string) {
  return /\b(portfolio|holding|holdings|p&l|profit and loss)\b/i.test(input);
}

function isMutualFundQuery(input: string) {
  return /\b(mutual fund|nav|scheme|sip|amc|fund house)\b/i.test(input);
}

function findSchemeCode(input: string) {
  const match = input.match(/\b\d{5,8}\b/);
  return match?.[0] ?? null;
}

async function buildContext(input: string) {
  try {
    if (isPortfolioQuery(input)) {
      const portfolio = await getPortfolioSnapshot();
      return {
        intent: "portfolio",
        data: portfolio.data,
        source: portfolio.source,
        timestamp: portfolio.timestamp
      };
    }

    if (isMutualFundQuery(input)) {
      const schemeCode = findSchemeCode(input);

      if (schemeCode) {
        const data = /\b(history|historical|trend|past)\b/i.test(input)
          ? await getMutualFundHistory(schemeCode)
          : await getMutualFundLatestNav(schemeCode);

        return {
          intent: "mutual_fund",
          data: data.data,
          source: data.source,
          timestamp: data.timestamp
        };
      }

      const matches = await searchMutualFunds(input.replace(/mutual fund|nav|sip/gi, "").trim());
      return {
        intent: "mutual_fund_search",
        data: matches.data,
        source: matches.source,
        timestamp: matches.timestamp
      };
    }

    const symbol = detectSymbol(input);

    if (symbol) {
      const quote = await getMarketData(symbol);
      return {
        intent: "stock",
        data: {
          symbol: quote.data.symbol,
          price: quote.data.price,
          change:
            quote.data.percentChange !== null
              ? `${quote.data.percentChange >= 0 ? "+" : ""}${quote.data.percentChange.toFixed(2)}%`
              : "Data not available",
          volume: quote.data.volume ?? "Data not available",
          source: quote.source.split("://")[0].toUpperCase(),
          timestamp: "live"
        },
        source: quote.source,
        timestamp: Date.now()
      };
    }
  } catch (error) {
    logDebugError(error, "assistant-query.buildContext");
  }

  return {
    intent: "general",
    data: null,
    source: "none",
    timestamp: Date.now()
  };
}

function toQueryResponse(result: ModelAnswer): QueryResponse {
  return {
    reply: {
      title: "",
      summary: result.answer,
      explanation: result.answer,
      keyPoints: [],
      steps: [],
      examples: [],
      visualHint: "none",
      chartData: null,
      structured: {
        title: "",
        summary: result.answer,
        explanation: result.answer,
        key_points: [],
        steps: [],
        examples: [],
        visual_hint: "none",
        chart_data: null
      },
      analysis: [],
      recommendation: "",
      markdown: result.answer,
      table: {
        columns: [],
        rows: []
      },
      chart: []
    },
    pipeline: [],
    meta: {
      modelMap: [],
      activeModel: result.source,
      confidenceScore: result.confidence,
      modelsUsed: result.modelsUsed ?? [result.source],
      route: {
        category: "financial",
        mode: result.confidence === 0 ? "degraded" : "primary"
      },
      attempts: []
    }
  };
}

export async function answerAssistantQuery(params: {
  input: string;
  selectedModel?: ModelProvider;
}) {
  const context = await buildContext(params.input);
  const result = await handleQuery({
    query: params.input,
    selectedModel: params.selectedModel ?? "pipeline",
    context
  });

  return toQueryResponse(result);
}
