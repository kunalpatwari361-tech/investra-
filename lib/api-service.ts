import { toError } from "@/lib/error-utils";
import { normalizeModelProvider, type ModelProvider } from "@/types/model";

type QueryPayload = {
  input?: string;
  query?: string;
  stream?: boolean;
  userId?: string;
  selectedModel?: unknown;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type NormalizedQueryPayload = {
  input: string;
  stream: boolean;
  userId?: string;
  selectedModel: ModelProvider;
};

export class QueryApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "QueryApiError";
    this.status = status;
  }
}

const MAX_INPUT_LENGTH = 2_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 25;
const rateLimitStore = new Map<string, RateLimitBucket>();

function cleanupRateLimitStore(now: number) {
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "anonymous";
  }

  return request.headers.get("x-real-ip") ?? "anonymous";
}

export function enforceQueryRateLimit(request: Request) {
  const identifier = getClientIdentifier(request);
  const now = Date.now();
  cleanupRateLimitStore(now);

  const current = rateLimitStore.get(identifier);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    const error = new QueryApiError(
      `Rate limit exceeded. Retry in ${retryAfterSeconds} seconds.`,
      429
    ) as QueryApiError & { retryAfterSeconds: number };

    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  current.count += 1;
}

export async function readQueryPayload(request: Request): Promise<NormalizedQueryPayload> {
  let payload: QueryPayload;

  try {
    payload = (await request.json()) as QueryPayload;
  } catch (error) {
    throw new QueryApiError(toError(error, "Request body must be valid JSON.").message, 400);
  }

  const rawInput = typeof payload.input === "string" ? payload.input : payload.query;
  const input = typeof rawInput === "string" ? rawInput.trim() : "";

  if (!input) {
    throw new QueryApiError("Enter a prompt for the assistant.", 400);
  }

  if (input.length > MAX_INPUT_LENGTH) {
    throw new QueryApiError(
      `Prompt is too long. Limit requests to ${MAX_INPUT_LENGTH} characters.`,
      400
    );
  }

  return {
    input,
    stream: payload.stream !== false,
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    selectedModel: normalizeModelProvider(payload.selectedModel)
  };
}
