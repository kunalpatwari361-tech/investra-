import { logDebugError } from "@/lib/error-utils";
import { callAiEndpoint, getFastAiEndpoint } from "@/lib/services/aiService";

export type IntentCategory = "simple" | "complex" | "financial";

const FAST_ENDPOINT = getFastAiEndpoint();
const CLASSIFIER_TIMEOUT_MS = 15_000;

const CLASSIFIER_PROMPT = `Classify this query into ONE word:
simple, complex, or financial.

Rules:

* simple -> greetings, basic chat
* complex -> reasoning, explanations
* financial -> stocks, markets, mutual funds, trading

Return ONLY one word.

Query: {user_input}`;

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|yo|hola)\b/i,
  /^(good morning|good afternoon|good evening)\b/i,
  /^(thanks|thank you)\b/i
];

const FINANCIAL_PATTERNS = [
  /\bstock(s)?\b/i,
  /\btrading\b/i,
  /\bprofit\b/i,
  /\bloss\b/i,
  /\bportfolio\b/i,
  /\bholding(s)?\b/i,
  /\bp&l\b/i,
  /\bmarket\b/i,
  /\bnifty\b/i,
  /\bsensex\b/i,
  /\bshare price\b/i,
  /\binvest(ing|ment)?\b/i,
  /\bmutual fund\b/i,
  /\bnav\b/i,
  /\bscheme\b/i,
  /\bsip\b/i,
  /\bamc\b/i,
  /\bfund house\b/i
];

function sanitizeCategory(value: string): IntentCategory | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === "simple" || normalized === "complex" || normalized === "financial") {
    return normalized;
  }

  return null;
}

function classifyWithRules(input: string): IntentCategory | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return "simple";
  }

  if (trimmed.length <= 20 && SIMPLE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "simple";
  }

  if (FINANCIAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "financial";
  }

  return null;
}

export async function classifyQuery(input: string) {
  const ruleBasedCategory = classifyWithRules(input);

  if (ruleBasedCategory) {
    return ruleBasedCategory;
  }

  try {
    const response = await callAiEndpoint({
      url: FAST_ENDPOINT.url,
      model: FAST_ENDPOINT.model,
      prompt: CLASSIFIER_PROMPT.replace("{user_input}", input),
      temperature: 0,
      timeoutMs: CLASSIFIER_TIMEOUT_MS
    });

    return sanitizeCategory(response) ?? "complex";
  } catch (error) {
    logDebugError(error, "router.classifyQuery");
    return "complex" as const;
  }
}
