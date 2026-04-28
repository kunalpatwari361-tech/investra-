import { getApiErrorMessage } from "@/lib/error-utils";
import type { ApiEnvelope, ApiErrorEnvelope, ApiSource, ApiSuccessEnvelope } from "@/types/api";

export function createSuccessEnvelope<T>(
  source: ApiSource,
  data: T,
  meta?: Record<string, unknown>
): ApiSuccessEnvelope<T> {
  return {
    success: true,
    source,
    data,
    live: true,
    timestamp: Date.now(),
    ...(meta ? { meta } : {})
  };
}

export function createErrorEnvelope(
  source: ApiSource,
  error: string,
  meta?: Record<string, unknown>
): ApiErrorEnvelope {
  return {
    success: false,
    source,
    data: null,
    live: false,
    error,
    timestamp: Date.now(),
    ...(meta ? { meta } : {})
  };
}

export function unwrapEnvelope<T>(envelope: ApiEnvelope<T>) {
  if (!envelope.success) {
    throw new Error(envelope.error);
  }

  return envelope.data;
}

export async function fetchJson<T>(url: string, fallbackMessage: string, init?: RequestInit) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      ...(init?.headers ?? {})
    },
    signal: init?.signal ?? AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, fallbackMessage));
  }

  return {
    data: (await response.json()) as T,
    durationMs: Date.now() - startedAt
  };
}
