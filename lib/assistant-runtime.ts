import { getMarketData } from "@/lib/data-access";
import { logDebugError } from "@/lib/error-utils";
import { runWithFailover, type ModelAttempt, type ModelTarget } from "@/lib/fallback";
import { callAiEndpoint } from "@/lib/services/aiService";
import { getPortfolioSnapshot } from "@/lib/services/marketDataService";
import {
  getMutualFundHistory,
  getMutualFundLatestNav,
  listMutualFunds,
  searchMutualFunds,
  type MutualFundHistory,
  type MutualFundLatest,
  type MutualFundMatch
} from "@/lib/services/mfService";
import { pipelineSteps } from "@/lib/pipeline";
import { classifyQuery, type IntentCategory } from "@/lib/router";
import type { LiveMarketQuote, PortfolioSnapshot } from "@/types/finance";
import type {
  ChartPoint,
  PipelineStep,
  QueryResponse,
  QueryStreamEvent,
  ResponseTableData,
  StructuredChartData,
  StructuredReplyPayload,
  VisualHint
} from "@/types/chat";

type StreamHandler = (event: QueryStreamEvent) => Promise<void> | void;

type RuntimeOptions = {
  input: string;
  onEvent: StreamHandler;
};

type MutualFundIntent = "search" | "latest_nav" | "history";

type MutualFundQueryContext = {
  intent: MutualFundIntent;
  query: string;
  matches: MutualFundMatch[];
  selectedFund?: MutualFundMatch;
  latest?: MutualFundLatest;
  history?: MutualFundHistory;
  usedFallbackList?: boolean;
};

type ModelRuntime = ModelTarget & {
  tier: "fast" | "reasoning";
};

type ReplyArtifacts = {
  table: ResponseTableData;
  chart: ChartPoint[];
  visualHint: VisualHint;
  chartData: StructuredChartData | null;
};

type StructuredModelResponse = Partial<{
  title: string;
  summary: string;
  explanation: string;
  key_points: unknown;
  steps: unknown;
  examples: unknown;
  visual_hint: unknown;
  chart_data: unknown;
}>;

const ROUTER_RUNTIME: ModelRuntime = {
  label: "Conversation Engine",
  model: process.env.ROUTER_MODEL ?? "phi3:latest",
  baseUrl:
    process.env.OLLAMA_PHI_URL ??
    process.env.OLLAMA_BASE_URL ??
    "http://127.0.0.1:11434",
  tier: "fast"
};

const REASONING_RUNTIME: ModelRuntime = {
  label: "Reasoning Engine",
  model: process.env.REASONING_MODEL ?? "llama3:8b-instruct-q4_K_M",
  baseUrl:
    process.env.OLLAMA_REASONING_URL ??
    process.env.OLLAMA_PHI_URL ??
    process.env.OLLAMA_BASE_URL ??
    "http://127.0.0.1:11434",
  tier: "reasoning"
};

const MODEL_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.MODEL_TIMEOUT_MS ?? "10000"), 5_000),
  20_000
);
const VALIDATION_TIMEOUT_MS = 2_000;
const MUTUAL_FUND_SUGGESTION_LIMIT = 5;
const SYMBOL_STOP_WORDS = new Set([
  "AI",
  "API",
  "AND",
  "THE",
  "WHAT",
  "SHOW",
  "WITH",
  "THIS",
  "THAT",
  "WILL",
  "FROM",
  "YOUR",
  "MY",
  "IS",
  "ARE"
]);
const MUTUAL_FUND_STOP_WORDS = new Set([
  "MUTUAL",
  "FUND",
  "FUNDS",
  "NAV",
  "LATEST",
  "SHOW",
  "HISTORY",
  "HISTORICAL",
  "SEARCH",
  "FIND",
  "WHAT",
  "IS",
  "THE",
  "OF",
  "FOR",
  "ME",
  "PLEASE",
  "TELL",
  "CURRENT",
  "TODAY",
  "INVESTMENT",
  "INVEST"
]);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function cloneSteps() {
  return pipelineSteps.map((step) => ({ ...step }));
}

function updateStep(
  steps: PipelineStep[],
  stepId: PipelineStep["id"],
  status: PipelineStep["status"],
  description?: string
) {
  return steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status,
          description: description ?? step.description
        }
      : step
  );
}

async function emitPipeline(onEvent: StreamHandler, steps: PipelineStep[]) {
  await onEvent({
    type: "pipeline",
    steps
  });
}

function normalizeStringArray(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeVisualHint(value: unknown, fallback: VisualHint): VisualHint {
  const validHints = new Set<VisualHint>([
    "line-chart",
    "bar-chart",
    "pie-chart",
    "table",
    "timeline",
    "cards",
    "stat",
    "none"
  ]);

  return typeof value === "string" && validHints.has(value as VisualHint)
    ? (value as VisualHint)
    : fallback;
}

function normalizeChartData(
  value: unknown,
  fallback: StructuredChartData | null
): StructuredChartData | null {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const type =
    typeof record.type === "string" &&
    ["line", "bar", "pie", "area", "table", "stat", "none"].includes(record.type)
      ? (record.type as StructuredChartData["type"])
      : fallback?.type ?? "none";
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : fallback?.title ?? "Chart data";
  const rawData = Array.isArray(record.data) ? record.data : [];

  const data = rawData
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const point = entry as Record<string, unknown>;
      const label = typeof point.label === "string" ? point.label.trim() : "";
      const numericValue =
        typeof point.value === "number"
          ? point.value
          : typeof point.value === "string"
            ? Number(point.value)
            : NaN;

      if (!label || !Number.isFinite(numericValue)) {
        return null;
      }

      return {
        label,
        value: numericValue
      } satisfies ChartPoint;
    })
    .filter((point): point is ChartPoint => Boolean(point))
    .slice(0, 12);

  if (data.length === 0 && fallback) {
    return fallback;
  }

  return {
    type,
    title,
    data
  };
}

function buildMarketQuoteContext(quote: LiveMarketQuote) {
  return [
    `Symbol: ${quote.symbol}`,
    quote.price !== null ? `Price: ${formatCurrency(quote.price)}` : "Price: unavailable",
    quote.change !== null ? `Change: ${formatCurrency(quote.change)}` : "Change: unavailable",
    quote.percentChange !== null
      ? `Percent change: ${formatPercent(quote.percentChange)}`
      : "Percent change: unavailable",
    quote.volume !== null ? `Volume: ${quote.volume.toLocaleString("en-IN")}` : "Volume: unavailable"
  ].join("\n");
}

function buildMarketModelPayload(quote: LiveMarketQuote | undefined, source: string | undefined) {
  if (!quote) {
    return {
      symbol: "Data not available",
      price: "Data not available",
      change: "Data not available",
      volume: "Data not available",
      source: "Data not available",
      timestamp: "Data not available"
    };
  }

  return {
    symbol: quote.symbol,
    price: quote.price ?? "Data not available",
    change: quote.percentChange !== null ? formatPercent(quote.percentChange) : "Data not available",
    volume: quote.volume ?? "Data not available",
    source: source?.split("://")[0]?.toUpperCase() || "NSE",
    timestamp: "live"
  };
}

function isPortfolioQuery(input: string) {
  return /\b(portfolio|holding|holdings|p&l|profit and loss)\b/i.test(input);
}

function buildPortfolioContext(snapshot: PortfolioSnapshot) {
  return [
    `Total investment: ${formatCurrency(snapshot.totalInvestment)}`,
    `Current value: ${formatCurrency(snapshot.currentValue)}`,
    `P&L: ${formatCurrency(snapshot.profitLoss)} (${formatPercent(snapshot.returnsPercent)})`,
    `Holdings: ${snapshot.holdings
      .map((holding) => `${holding.symbol} price=${holding.currentPrice ?? "NA"} pnl=${holding.profitLoss.toFixed(2)}`)
      .join("; ")}`
  ].join("\n");
}

function detectMutualFundIntent(input: string): MutualFundIntent | null {
  const normalized = input.toLowerCase();

  if (!/\b(mutual fund|nav|scheme|amc|sip|fund house)\b/i.test(input)) {
    return null;
  }

  if (/\b(history|historical|trend|past|last)\b/i.test(normalized) && /\bnav\b/i.test(normalized)) {
    return "history";
  }

  if (/\b(latest|current|today(?:'s)?|recent)\b/i.test(normalized) && /\bnav\b/i.test(normalized)) {
    return "latest_nav";
  }

  return "search";
}

function extractMutualFundQuery(input: string) {
  const normalized = input
    .replace(
      /\b(latest|current|today(?:'s)?|recent|show|what is|tell me|give me|search|find|suggest|recommend|history|historical|nav|mutual fund|fund house|scheme code|scheme|fund|of|for|please)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (normalized) {
    return normalized;
  }

  return input
    .toUpperCase()
    .split(/[^A-Z0-9&]+/)
    .map((token) => token.trim())
    .filter((token) => token && !MUTUAL_FUND_STOP_WORDS.has(token))
    .join(" ")
    .trim();
}

function rankMutualFundMatches(query: string, matches: MutualFundMatch[]) {
  const normalizedQuery = query.trim().toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);

  return [...matches].sort((left, right) => {
    const score = (match: MutualFundMatch) => {
      const name = match.schemeName.toLowerCase();
      let value = 0;

      if (normalizedQuery && name.startsWith(normalizedQuery)) {
        value += 12;
      }

      if (normalizedQuery && name.includes(normalizedQuery)) {
        value += 8;
      }

      value += words.filter((word) => name.includes(word)).length * 3;
      return value;
    };

    return score(right) - score(left) || left.schemeName.length - right.schemeName.length;
  });
}

async function resolveMutualFundContext(input: string) {
  const intent = detectMutualFundIntent(input);

  if (!intent) {
    return null;
  }

  const query = extractMutualFundQuery(input);
  const matches = rankMutualFundMatches(query, (await searchMutualFunds(query || input)).data);
  const selectedFund = matches[0];

  if (intent === "latest_nav" && selectedFund) {
    return {
      intent,
      query,
      matches,
      selectedFund,
      latest: (await getMutualFundLatestNav(selectedFund.schemeCode)).data
    } satisfies MutualFundQueryContext;
  }

  if (intent === "history" && selectedFund) {
    return {
      intent,
      query,
      matches,
      selectedFund,
      history: (await getMutualFundHistory(selectedFund.schemeCode)).data
    } satisfies MutualFundQueryContext;
  }

  if (matches.length > 0) {
    return {
      intent,
      query,
      matches: matches.slice(0, MUTUAL_FUND_SUGGESTION_LIMIT),
      selectedFund
    } satisfies MutualFundQueryContext;
  }

  return {
    intent,
    query,
    matches: (await listMutualFunds()).data.slice(0, MUTUAL_FUND_SUGGESTION_LIMIT),
    usedFallbackList: true
  } satisfies MutualFundQueryContext;
}

function buildMutualFundContext(data: MutualFundQueryContext) {
  if (data.intent === "latest_nav" && data.latest) {
    return [
      `Scheme: ${data.latest.schemeName}`,
      `Scheme code: ${data.latest.schemeCode}`,
      `Fund house: ${data.latest.fundHouse}`,
      `Category: ${data.latest.schemeCategory}`,
      `NAV: ${data.latest.nav}`,
      `Date: ${data.latest.date}`
    ].join("\n");
  }

  if (data.intent === "history" && data.history) {
    return [
      `Scheme: ${data.history.schemeName}`,
      `Scheme code: ${data.history.schemeCode}`,
      `Fund house: ${data.history.fundHouse}`,
      `Category: ${data.history.schemeCategory}`,
      `Latest NAV: ${data.history.latestNav}`,
      `Latest date: ${data.history.latestDate}`,
      `Recent NAV points: ${data.history.points.map((point) => `${point.date}=${point.nav}`).join(", ")}`
    ].join("\n");
  }

  return [
    `Search query: ${data.query || "general mutual fund lookup"}`,
    `Matches: ${data.matches.map((match) => `${match.schemeName} [${match.schemeCode}]`).join("; ")}`
  ].join("\n");
}

function buildMutualFundArtifacts(data: MutualFundQueryContext): ReplyArtifacts {
  if (data.intent === "latest_nav" && data.latest) {
    const points = [{ label: "NAV", value: Number(data.latest.nav) }];

    return {
      table: {
        columns: ["Field", "Value"],
        rows: [
          ["Scheme", data.latest.schemeName],
          ["Scheme code", String(data.latest.schemeCode)],
          ["NAV", data.latest.nav],
          ["Date", data.latest.date]
        ]
      },
      chart: points,
      visualHint: "stat",
      chartData: {
        type: "stat",
        title: "Latest NAV snapshot",
        data: points
      }
    };
  }

  if (data.intent === "history" && data.history) {
    const points = data.history.points.slice().reverse().map((point) => ({
      label: point.date,
      value: Number(point.nav)
    }));

    return {
      table: {
        columns: ["Date", "NAV"],
        rows: data.history.points.slice(0, 6).map((point) => [point.date, point.nav])
      },
      chart: points,
      visualHint: "line-chart",
      chartData: {
        type: "line",
        title: "NAV trend",
        data: points
      }
    };
  }

  const points = data.matches.map((match, index) => ({
    label: `${index + 1}`,
    value: 100 - index * 12
  }));

  return {
    table: {
      columns: ["Scheme code", "Scheme name"],
      rows: data.matches.map((match) => [String(match.schemeCode), match.schemeName])
    },
    chart: points,
    visualHint: "table",
    chartData: {
      type: "table",
      title: "Mutual fund matches",
      data: points
    }
  };
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

  const upperTokens = normalized.match(/\b[A-Z]{2,15}\b/g) ?? [];
  return upperTokens.find((candidate) => !SYMBOL_STOP_WORDS.has(candidate)) ?? "NIFTY";
}

function buildFinancialArtifacts(marketQuote: LiveMarketQuote | undefined): ReplyArtifacts {
  if (!marketQuote) {
    return {
      table: {
        columns: ["Metric", "Value"],
        rows: [["Context", "Financial data unavailable"]]
      },
      chart: [],
      visualHint: "cards",
      chartData: null
    };
  }

  const points = [
    { label: "Price move", value: Math.min(100, Math.max(0, 50 + (marketQuote.percentChange ?? 0) * 15)) },
    { label: "Volume", value: marketQuote.volume ? 80 : 40 },
    { label: "Signal strength", value: marketQuote.price !== null ? 72 : 35 }
  ];

  return {
    table: {
      columns: ["Metric", "Value"],
      rows: [
        ["Symbol", marketQuote.symbol],
        ["Price", marketQuote.price !== null ? formatCurrency(marketQuote.price) : "Unavailable"],
        [
          "Change",
          marketQuote.percentChange !== null ? formatPercent(marketQuote.percentChange) : "Unavailable"
        ],
        [
          "Volume",
          marketQuote.volume !== null ? marketQuote.volume.toLocaleString("en-IN") : "Unavailable"
        ]
      ]
    },
    chart: points,
    visualHint: "bar-chart",
    chartData: {
      type: "bar",
      title: "Live market snapshot",
      data: points
    }
  };
}

function buildDefaultArtifacts(category: IntentCategory): ReplyArtifacts {
  const points =
    category === "complex"
      ? [
          { label: "Clarity", value: 88 },
          { label: "Depth", value: 90 },
          { label: "Actionability", value: 84 }
        ]
      : [
          { label: "Speed", value: 94 },
          { label: "Reasoning", value: 83 },
          { label: "Finance context", value: 91 }
        ];

  return {
    table: {
      columns: ["Capability", "What happens"],
      rows:
        category === "complex"
          ? [
              ["Concept", "Starts with the main idea"],
              ["Tradeoff", "Surfaces what can go wrong"],
              ["Action", "Ends with the next step"]
            ]
          : [
              ["Conversation", "Handles direct questions quickly"],
              ["Reasoning", "Escalates to deeper analysis when needed"],
              ["Finance", "Adds live market context when useful"]
            ]
    },
    chart: points,
    visualHint: "cards",
    chartData: {
      type: "bar",
      title: category === "complex" ? "Response profile" : "Assistant capabilities",
      data: points
    }
  };
}

function buildArtifacts(params: {
  category: IntentCategory;
  marketQuote?: LiveMarketQuote;
  mutualFund?: MutualFundQueryContext;
  portfolio?: PortfolioSnapshot;
}) {
  if (params.mutualFund) {
    return buildMutualFundArtifacts(params.mutualFund);
  }

  if (params.category === "financial") {
    if (params.portfolio) {
      return {
        table: {
          columns: ["Symbol", "Price", "P&L"],
          rows: params.portfolio.holdings.map((holding) => [
            holding.symbol,
            holding.currentPrice === null ? "Unavailable" : formatCurrency(holding.currentPrice),
            formatCurrency(holding.profitLoss)
          ])
        },
        chart: params.portfolio.holdings.map((holding) => ({
          label: holding.symbol,
          value: holding.profitLoss
        })),
        visualHint: "table" as const,
        chartData: null
      };
    }

    return buildFinancialArtifacts(params.marketQuote);
  }

  return buildDefaultArtifacts(params.category);
}

function buildFallbackStructured(params: {
  category: IntentCategory;
  marketQuote?: LiveMarketQuote;
  mutualFund?: MutualFundQueryContext;
  portfolio?: PortfolioSnapshot;
  artifacts: ReplyArtifacts;
}) {
  if (params.mutualFund?.intent === "latest_nav" && params.mutualFund.latest) {
    const latest = params.mutualFund.latest;

    return {
      title: latest.schemeName,
      summary: `${latest.schemeName} has a latest NAV of ${latest.nav} as of ${latest.date}.`,
      explanation: `This NAV comes from the live MFAPI feed for scheme code ${latest.schemeCode}.`,
      key_points: [
        `Fund house: ${latest.fundHouse}.`,
        `Category: ${latest.schemeCategory}.`,
        `Date: ${latest.date}.`
      ],
      steps: [
        "Use the latest NAV as a reference point.",
        "Compare it with similar schemes if needed."
      ],
      examples: ["Show NAV history", "Compare with another fund"],
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  if (params.mutualFund?.intent === "history" && params.mutualFund.history) {
    const history = params.mutualFund.history;

    return {
      title: `${history.schemeName} NAV History`,
      summary: `${history.schemeName} latest NAV is ${history.latestNav} on ${history.latestDate}.`,
      explanation: `The recent NAV history covers ${history.points.length} data points from MFAPI.`,
      key_points: [
        `Fund house: ${history.fundHouse}.`,
        `Category: ${history.schemeCategory}.`,
        "NAV history shows direction, not a guarantee."
      ],
      steps: [
        "Review the recent trend.",
        "Compare it with category peers.",
        "Use your time horizon before acting."
      ],
      examples: ["Summarize the trend", "Compare two schemes"],
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  if (params.mutualFund) {
    return {
      title: "Mutual Fund Search Results",
      summary: params.mutualFund.matches.length
        ? `I found ${params.mutualFund.matches.length} relevant mutual fund matches.`
        : "I could not find a direct mutual fund match.",
      explanation: "The response is based on live MFAPI search results.",
      key_points: params.mutualFund.matches.slice(0, 4).map((match) => `Match: ${match.schemeName}`),
      steps: [
        "Choose the exact scheme name.",
        "Ask for the latest NAV.",
        "Ask for NAV history if you want a trend."
      ],
      examples: params.mutualFund.matches.slice(0, 2).map((match) => `Show latest NAV of ${match.schemeName}`),
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  if (params.portfolio) {
    return {
      title: "Portfolio Snapshot",
      summary: `Your sample portfolio is at ${formatCurrency(params.portfolio.currentValue)} with P&L of ${formatCurrency(params.portfolio.profitLoss)}.`,
      explanation: `The return is ${formatPercent(params.portfolio.returnsPercent)} based on dummy holdings refreshed with live market prices.`,
      key_points: params.portfolio.holdings
        .slice(0, 4)
        .map((holding) => `${holding.symbol}: ${formatCurrency(holding.profitLoss)} P&L.`),
      steps: [
        "Review the largest profit and loss contributors.",
        "Use this as a sample portfolio view, not account-confirmed data."
      ],
      examples: ["Analyze RELIANCE", "Which holding is weakest?"],
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  if (params.category === "financial") {
    return {
      title: "Market Insight",
      summary: params.marketQuote
        ? `${params.marketQuote.symbol} is being reviewed with live market data.`
        : "Live market data is limited for this request.",
      explanation: params.marketQuote
        ? `Current price is ${
            params.marketQuote.price !== null ? formatCurrency(params.marketQuote.price) : "unavailable"
          }${params.marketQuote.percentChange !== null ? ` with a move of ${formatPercent(params.marketQuote.percentChange)}` : ""}.`
        : "The answer stays conservative because live market data is unavailable.",
      key_points: [
        params.marketQuote && params.marketQuote.change !== null
          ? `Price change: ${formatCurrency(params.marketQuote.change)}.`
          : "Price change is unavailable.",
        params.marketQuote && params.marketQuote.volume !== null
          ? `Volume: ${params.marketQuote.volume.toLocaleString("en-IN")}.`
          : "Volume is unavailable.",
        "Use live prices as context, not as the whole decision."
      ],
      steps: [
        "Check the current move.",
        "Review the broader trend.",
        "Match any action to your time horizon."
      ],
      examples: [
        "Compare this symbol with another stock.",
        "Explain whether this move is strong or weak."
      ],
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  if (params.category === "complex") {
    return {
      title: "Reasoned Explanation",
      summary: "This question needs a reasoned answer rather than a short reply.",
      explanation: "The response should start with the main idea, explain tradeoffs, and end with a practical next step.",
      key_points: [
        "Start with the main idea.",
        "Surface the tradeoff clearly.",
        "End with an actionable next step."
      ],
      steps: [
        "Clarify the objective.",
        "Evaluate the tradeoffs.",
        "Choose the next action that fits your constraints."
      ],
      examples: ["Explain this for a beginner.", "Compare two approaches with pros and cons."],
      visual_hint: params.artifacts.visualHint,
      chart_data: params.artifacts.chartData
    } satisfies StructuredReplyPayload;
  }

  return {
    title: "Direct Answer",
    summary: "I can help with finance questions, market data, portfolio snapshots, and investment concepts.",
    explanation: "Ask a direct question and I will answer in plain language using available backend data when relevant.",
    key_points: [
      "I can explain financial concepts.",
      "I can summarize available market data.",
      "I can keep answers short and practical."
    ],
    steps: ["Ask directly.", "Refine if you need more detail."],
    examples: ["Explain SIP investment", "How does compounding work?"],
    visual_hint: params.artifacts.visualHint,
    chart_data: params.artifacts.chartData
  } satisfies StructuredReplyPayload;
}

function buildSystemPrompt(category: IntentCategory) {
  const role =
    category === "financial"
      ? "You are a financial backend assistant."
      : category === "complex"
        ? "You are a reasoning backend assistant."
        : "You are a concise backend assistant.";

  return [
    role,
    "Return ONLY valid JSON.",
    "Do not include markdown fences.",
    'Use this exact schema: {"title":"","summary":"","explanation":"","key_points":[],"steps":[],"examples":[],"visual_hint":"","chart_data":{"type":"","title":"","data":[{"label":"","value":0}]}}',
    "Allowed visual_hint values: line-chart, bar-chart, pie-chart, table, timeline, cards, stat, none.",
    "Allowed chart_data.type values: line, bar, pie, area, table, stat, none.",
    "If no chart is useful, set chart_data to null and visual_hint to none.",
    "Keep arrays concise and specific.",
    "Do not mention internal routing, EC2, retries, failover, or hidden system behavior."
  ].join(" ");
}

function buildPrompt(params: {
  input: string;
  category: IntentCategory;
  marketQuote?: LiveMarketQuote;
  marketSource?: string;
  mutualFund?: MutualFundQueryContext;
  portfolio?: PortfolioSnapshot;
  fallbackStructured: StructuredReplyPayload;
}) {
  const sections = [
    `User query: ${params.input}`,
    `Intent category: ${params.category}`,
    "Return a structured, visual-ready answer for a ChatGPT-style frontend."
  ];

  if (params.portfolio) {
    sections.push("Use this portfolio context:");
    sections.push(buildPortfolioContext(params.portfolio));
  } else if (params.mutualFund) {
    sections.push("Use this live mutual fund context:");
    sections.push(buildMutualFundContext(params.mutualFund));
  } else if (params.category === "financial") {
    sections.push("Use this normalized live market JSON:");
    sections.push(JSON.stringify(buildMarketModelPayload(params.marketQuote, params.marketSource)));
    sections.push("Readable market context:");
    sections.push(params.marketQuote ? buildMarketQuoteContext(params.marketQuote) : "Unavailable");
  }

  sections.push("If any field is uncertain, stay conservative and concise.");
  sections.push(`Fallback reference JSON: ${JSON.stringify(params.fallbackStructured)}`);

  return sections.join("\n\n");
}

function extractJsonCandidate(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1];

  if (fenced) {
    return fenced.trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  return raw.trim();
}

function normalizeStructuredResponse(params: {
  raw: string;
  fallback: StructuredReplyPayload;
  fallbackVisualHint: VisualHint;
  fallbackChartData: StructuredChartData | null;
}) {
  let parsed: StructuredModelResponse = {};

  try {
    parsed = JSON.parse(extractJsonCandidate(params.raw)) as StructuredModelResponse;
  } catch {
    parsed = {};
  }

  return {
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : params.fallback.title,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : params.fallback.summary,
    explanation:
      typeof parsed.explanation === "string" && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : params.fallback.explanation,
    key_points: normalizeStringArray(parsed.key_points).length
      ? normalizeStringArray(parsed.key_points)
      : params.fallback.key_points,
    steps: normalizeStringArray(parsed.steps).length
      ? normalizeStringArray(parsed.steps)
      : params.fallback.steps,
    examples: normalizeStringArray(parsed.examples).length
      ? normalizeStringArray(parsed.examples)
      : params.fallback.examples,
    visual_hint: normalizeVisualHint(parsed.visual_hint, params.fallbackVisualHint),
    chart_data: normalizeChartData(parsed.chart_data, params.fallbackChartData)
  } satisfies StructuredReplyPayload;
}

function buildRecommendation(payload: StructuredReplyPayload, category: IntentCategory) {
  if (payload.steps[0]) {
    return payload.steps[0];
  }

  if (category === "financial") {
    return "Use the latest market context as one input, not the whole decision.";
  }

  if (category === "complex") {
    return "State your objective and constraints if you want a tighter answer.";
  }

  return "Ask a follow-up if you want a deeper explanation.";
}

function renderMarkdown(payload: StructuredReplyPayload, recommendation: string) {
  return [
    `# ${payload.title}`,
    "",
    "## Summary",
    "",
    payload.summary,
    "",
    "## Analysis",
    "",
    payload.explanation,
    "",
    "## Recommendation",
    "",
    recommendation
  ].join("\n");
}

function buildReply(params: {
  payload: StructuredReplyPayload;
  artifacts: ReplyArtifacts;
  category: IntentCategory;
}) {
  const recommendation = buildRecommendation(params.payload, params.category);
  const markdown = renderMarkdown(params.payload, recommendation);
  const analysis = [params.payload.explanation, ...params.payload.key_points]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  const chartData = params.payload.chart_data ?? params.artifacts.chartData;
  const chart = chartData?.data?.length ? chartData.data : params.artifacts.chart;

  return {
    title: params.payload.title,
    summary: params.payload.summary,
    explanation: params.payload.explanation,
    keyPoints: params.payload.key_points,
    steps: params.payload.steps,
    examples: params.payload.examples,
    visualHint: params.payload.visual_hint,
    chartData,
    structured: params.payload,
    analysis,
    recommendation,
    markdown,
    table: params.artifacts.table,
    chart
  } satisfies QueryResponse["reply"];
}

function buildMeta(params: {
  category: IntentCategory;
  primaryModel: ModelRuntime;
  activeModel?: ModelRuntime;
  usedData: boolean;
  toolsUsed: string[];
  dataSources: string[];
  fallbackModel?: ModelRuntime;
  activeModelOverride?: string;
  routeMode: "primary" | "fallback" | "degraded";
  attempts: ModelAttempt[];
  confidenceScore?: number;
}) {
  const isMutualFundContext = params.toolsUsed.some(
    (tool) => tool.includes("Fund") || tool.includes("NAV")
  );

  return {
    modelMap:
      params.category === "simple"
        ? [
            {
              label: "Conversation Engine",
              role: "Handles lightweight questions with low latency"
            }
          ]
        : [
            {
              label: "Conversation Engine",
              role: "Routes requests and acts as the fast failover path"
            },
            {
              label: "Reasoning Engine",
              role: "Handles deeper explanations and financial analysis"
            },
            ...(params.usedData
              ? [
                  {
                    label: isMutualFundContext ? "MFAPI Context" : "Live Market Context",
                    role: isMutualFundContext
                      ? "Adds live mutual fund search, NAV, and history data"
                      : "Adds NSE quote context"
                  }
                ]
              : [])
          ],
    toolsUsed: params.toolsUsed,
    dataSources: params.dataSources,
    activeModel:
      params.activeModelOverride ??
      `${(params.activeModel ?? params.primaryModel).label} (${(params.activeModel ?? params.primaryModel).model})`,
    fallbackModel: params.fallbackModel
      ? `${params.fallbackModel.label} (${params.fallbackModel.model})`
      : undefined,
    route: {
      category: params.category,
      mode: params.routeMode
    },
    attempts: params.attempts
      .filter((attempt, index, self) =>
        self.findIndex(
          (entry) =>
            entry.label === attempt.label &&
            entry.model === attempt.model &&
            entry.status === attempt.status &&
            entry.durationMs === attempt.durationMs
        ) === index
      ),
    confidenceScore: params.confidenceScore
  };
}

function parseConfidence(raw: string) {
  const match = raw.match(/\b([1-9][0-9]?|100)\b/);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 78;
}

async function validateModelAnswer(params: {
  input: string;
  payload: StructuredReplyPayload;
}) {
  const startedAt = Date.now();

  try {
    const text = await callAiEndpoint({
      url: ROUTER_RUNTIME.baseUrl,
      model: ROUTER_RUNTIME.model,
      system:
        "You validate finance assistant answers. Return only a confidence number from 1 to 100.",
      prompt: [
        `User query: ${params.input}`,
        `Answer summary: ${params.payload.summary}`,
        `Answer explanation: ${params.payload.explanation}`,
        "Score factual caution, clarity, and usefulness."
      ].join("\n"),
      temperature: 0,
      timeoutMs: VALIDATION_TIMEOUT_MS
    });

    return {
      confidenceScore: parseConfidence(text),
      attempt: {
        model: ROUTER_RUNTIME.model,
        label: "Fast Validation Model",
        status: "success" as const,
        durationMs: Date.now() - startedAt
      }
    };
  } catch (error) {
    return {
      confidenceScore: 72,
      attempt: {
        model: ROUTER_RUNTIME.model,
        label: "Fast Validation Model",
        status: "error" as const,
        durationMs: Date.now() - startedAt,
        error: "Validation skipped"
      }
    };
  }
}

async function streamChunks(markdown: string, onEvent: StreamHandler) {
  const chunks = markdown.match(/.{1,120}(\s|$)/g) ?? [markdown];

  for (const chunk of chunks) {
    await onEvent({
      type: "delta",
      delta: chunk
    });
  }
}

export async function streamAssistantQuery(options: RuntimeOptions) {
  let steps = cloneSteps();
  await emitPipeline(options.onEvent, steps);

  steps = updateStep(steps, "intent", "active");
  await emitPipeline(options.onEvent, steps);

  const category = await classifyQuery(options.input);

  steps = updateStep(steps, "intent", "complete");
  steps = updateStep(steps, "tools", "active");
  await emitPipeline(options.onEvent, steps);

  const primaryRuntime = category === "simple" ? ROUTER_RUNTIME : REASONING_RUNTIME;
  const fallbackRuntime = primaryRuntime.tier === "fast" ? undefined : ROUTER_RUNTIME;

  let marketQuote: LiveMarketQuote | undefined;
  let mutualFund: MutualFundQueryContext | undefined;
  let portfolio: PortfolioSnapshot | undefined;
  let toolsUsed: string[] = [];
  const dataSources: string[] = [];

  if (category === "financial") {
    steps = updateStep(
      steps,
      "tools",
      "complete",
      "Routing to the reasoning model with market-data enrichment enabled."
    );
    steps = updateStep(steps, "fetch", "active");
    await emitPipeline(options.onEvent, steps);

    try {
      if (isPortfolioQuery(options.input)) {
        portfolio = (await getPortfolioSnapshot()).data;
        toolsUsed = ["marketDataService.getPortfolioSnapshot()"];
        dataSources.push("nse://portfolio-with-yahoo-fallback");
        steps = updateStep(
          steps,
          "fetch",
          "complete",
          "Fetched sample portfolio with live market prices."
        );
      } else {
        mutualFund = (await resolveMutualFundContext(options.input)) ?? undefined;
      }

      if (mutualFund) {
        toolsUsed = [
          "searchFund()",
          ...(mutualFund.latest ? ["getLatestNAV()"] : []),
          ...(mutualFund.history ? ["getHistory()"] : []),
          ...(mutualFund.usedFallbackList ? ["listFunds()"] : [])
        ];
        dataSources.push(`${process.env.MFAPI_BASE_URL ?? "https://api.mfapi.in"}/mf`);
        steps = updateStep(
          steps,
          "fetch",
          "complete",
          mutualFund.intent === "history"
            ? "Fetched live mutual fund NAV history from MFAPI."
            : mutualFund.intent === "latest_nav"
              ? "Fetched live mutual fund NAV from MFAPI."
              : "Fetched mutual fund search results from MFAPI."
        );
      } else if (!portfolio) {
        const symbol = detectSymbol(options.input);
        const marketEnvelope = await getMarketData(symbol);
        marketQuote = marketEnvelope.data;
        toolsUsed = [...marketEnvelope.toolsUsed];
        dataSources.push(marketEnvelope.source);
        steps = updateStep(steps, "fetch", "complete", "Fetched live market quote context.");
      }
    } catch (error) {
      logDebugError(error, "assistant-runtime.financialFetch");
      steps = updateStep(
        steps,
        "fetch",
        "complete",
        "Live financial data is unavailable. Continuing with conservative reasoning."
      );
    }
  } else {
    steps = updateStep(
      steps,
      "tools",
      "complete",
      category === "complex"
        ? "Routing to the reasoning model with failover enabled."
        : "Routing to the low-latency model."
    );
    steps = updateStep(steps, "fetch", "complete", "No external data is required for this request.");
  }

  const artifacts = buildArtifacts({
    category,
    marketQuote,
    mutualFund,
    portfolio
  });
  const fallbackStructured = buildFallbackStructured({
    category,
    marketQuote,
    mutualFund,
    portfolio,
    artifacts
  });
  const shouldBypassModel = mutualFund?.intent === "search";
  const usedData = Boolean(marketQuote || mutualFund || portfolio);

  let routeMode: "primary" | "fallback" | "degraded" = "primary";
  let activeRuntime = primaryRuntime;
  let attempts: ModelAttempt[] = [];
  let confidenceScore = shouldBypassModel ? 92 : 76;

  await options.onEvent({
    type: "meta",
    meta: buildMeta({
      category,
      primaryModel: primaryRuntime,
      fallbackModel: fallbackRuntime,
      usedData,
      toolsUsed,
      dataSources,
      activeModelOverride: shouldBypassModel ? "MFAPI direct response" : undefined,
      routeMode,
      attempts,
      confidenceScore
    })
  });

  steps = updateStep(steps, "response", "active");
  await emitPipeline(options.onEvent, steps);

  let structuredPayload = fallbackStructured;

  if (!shouldBypassModel) {
    const prompt = buildPrompt({
      input: options.input,
      category,
      marketQuote,
      marketSource: dataSources[0],
      mutualFund,
      portfolio,
      fallbackStructured
    });
    const system = buildSystemPrompt(category);

    try {
      const modelResult = await runWithFailover({
        primary: primaryRuntime,
        fallback: fallbackRuntime,
        prompt,
        system,
        timeoutMs: MODEL_TIMEOUT_MS
      });

      attempts = modelResult.attempts;
      activeRuntime = modelResult.activeTarget as ModelRuntime;
      routeMode = modelResult.mode;
      structuredPayload = normalizeStructuredResponse({
        raw: modelResult.text,
        fallback: fallbackStructured,
        fallbackVisualHint: artifacts.visualHint,
        fallbackChartData: artifacts.chartData
      });

      if (category !== "simple") {
        const validation = await validateModelAnswer({
          input: options.input,
          payload: structuredPayload
        });
        confidenceScore = validation.confidenceScore;
        attempts = [...attempts, validation.attempt];
      } else {
        confidenceScore = 88;
      }

      if (routeMode === "fallback") {
        await options.onEvent({
          type: "meta",
          meta: buildMeta({
            category,
            primaryModel: primaryRuntime,
            activeModel: activeRuntime,
            fallbackModel: fallbackRuntime,
            usedData,
            toolsUsed,
            dataSources,
            routeMode,
            attempts,
            confidenceScore
          })
        });
      }
    } catch (error) {
      logDebugError(error, "assistant-runtime.modelFailover");
      routeMode = "degraded";
      confidenceScore = 64;
      attempts = Array.isArray((error as { attempts?: unknown }).attempts)
        ? ((error as { attempts?: ModelAttempt[] }).attempts ?? [])
        : [];
      structuredPayload = fallbackStructured;
    }
  }

  const reply = buildReply({
    payload: structuredPayload,
    artifacts,
    category
  });

  steps = updateStep(steps, "response", "complete", "Generated the final structured response.");
  await emitPipeline(options.onEvent, steps);
  await streamChunks(reply.markdown, options.onEvent);

  await options.onEvent({
    type: "final",
    data: {
      reply,
      pipeline: steps,
      meta: buildMeta({
        category,
        primaryModel: primaryRuntime,
        activeModel: activeRuntime,
        fallbackModel: fallbackRuntime,
        usedData,
        toolsUsed,
        dataSources,
        activeModelOverride: shouldBypassModel ? "MFAPI direct response" : undefined,
        routeMode,
        attempts,
        confidenceScore
      })
    }
  });
}
