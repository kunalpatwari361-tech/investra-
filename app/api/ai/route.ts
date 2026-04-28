import { NextResponse } from "next/server";
import { AppAuthError, requireAuthenticatedUser } from "@/lib/auth";
import { QueryApiError, enforceQueryRateLimit } from "@/lib/api-service";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope, createSuccessEnvelope } from "@/lib/services/api-utils";
import {
  callAiEndpoint,
  getAiEndpoints,
  getFastAiEndpoint,
  getReasoningAiEndpoint
} from "@/lib/services/aiService";

type AiPayload = {
  prompt?: string;
  input?: string;
  system?: string;
  model?: "fast" | "reasoning";
  timeoutMs?: number;
};

const SIMPLE_ASSISTANT_SYSTEM_PROMPT = `You are a helpful assistant.

Keep answers simple.
Use short sentences.
Avoid complex words.
Structure answers as:
1. What it is
2. Why it matters
3. Example (if useful)
Do not hallucinate numbers.`;

const MAX_PROMPT_LENGTH = 2_000;

export const dynamic = "force-dynamic";

function clampTimeout(timeoutMs: unknown) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return 8_000;
  }

  return Math.min(10_000, Math.max(2_000, Math.round(timeoutMs)));
}

function readPrompt(body: AiPayload) {
  const value = typeof body.prompt === "string" ? body.prompt : body.input;
  const prompt = typeof value === "string" ? value.trim() : "";

  if (!prompt) {
    throw new QueryApiError("prompt is required.", 400);
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new QueryApiError(
      `Prompt is too long. Limit requests to ${MAX_PROMPT_LENGTH} characters.`,
      400
    );
  }

  return prompt;
}

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser(request);

    return NextResponse.json(
      createSuccessEnvelope("ai", {
        configured: getAiEndpoints().length > 0,
        models: getAiEndpoints().map((endpoint) => ({
          label: endpoint.label,
          model: endpoint.model
        }))
      })
    );
  } catch (error: unknown) {
    if (error instanceof AppAuthError) {
      return NextResponse.json(createErrorEnvelope("ai", error.message), { status: error.status });
    }

    logDebugError(error, "api/ai.GET");
    return NextResponse.json(
      createErrorEnvelope("ai", getErrorMessage(error, "Unable to read AI configuration.")),
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    enforceQueryRateLimit(request);

    const body = (await request.json()) as AiPayload;
    const prompt = readPrompt(body);
    const target = body.model === "reasoning" ? getReasoningAiEndpoint() : getFastAiEndpoint();
    const text = await callAiEndpoint({
      url: target.url,
      model: target.model,
      prompt,
      system: body.system?.trim() || SIMPLE_ASSISTANT_SYSTEM_PROMPT,
      timeoutMs: clampTimeout(body.timeoutMs)
    });

    return NextResponse.json(
      createSuccessEnvelope("ai", {
        label: target.label,
        model: target.model,
        text
      })
    );
  } catch (error: unknown) {
    if (error instanceof AppAuthError) {
      return NextResponse.json(createErrorEnvelope("ai", error.message), { status: error.status });
    }

    if (error instanceof QueryApiError) {
      const retryAfterSeconds =
        "retryAfterSeconds" in error
          ? Number((error as QueryApiError & { retryAfterSeconds?: number }).retryAfterSeconds)
          : undefined;

      return NextResponse.json(createErrorEnvelope("ai", error.message), {
        status: error.status,
        headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined
      });
    }

    logDebugError(error, "api/ai.POST");
    return NextResponse.json(
      createErrorEnvelope("ai", getErrorMessage(error, "Unable to process AI request.")),
      { status: 500 }
    );
  }
}
