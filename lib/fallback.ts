import { callAiEndpoint } from "@/lib/services/aiService";
import { getErrorMessage } from "@/lib/error-utils";

export type ModelTarget = {
  label: string;
  model: string;
  baseUrl: string;
};

export type ModelAttempt = {
  model: string;
  label: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
};

export type FailoverResult = {
  text: string;
  activeTarget: ModelTarget;
  fallbackTarget?: ModelTarget;
  mode: "primary" | "fallback";
  attempts: ModelAttempt[];
};

async function invokeTarget(params: {
  target: ModelTarget;
  prompt: string;
  system: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  try {
    const text = await callAiEndpoint({
      url: params.target.baseUrl,
      model: params.target.model,
      prompt: params.prompt,
      system: params.system,
      timeoutMs: params.timeoutMs
    });

    return {
      text,
      attempt: {
        model: params.target.model,
        label: params.target.label,
        status: "success" as const,
        durationMs: Date.now() - startedAt
      }
    };
  } catch (error) {
    throw {
      attempt: {
        model: params.target.model,
        label: params.target.label,
        status: "error" as const,
        durationMs: Date.now() - startedAt,
        error: getErrorMessage(error, "Model request failed.")
      }
    };
  }
}

export async function runWithFailover(params: {
  primary: ModelTarget;
  fallback?: ModelTarget;
  prompt: string;
  system: string;
  timeoutMs: number;
}) {
  const attempts: ModelAttempt[] = [];

  try {
    const primaryResult = await invokeTarget({
      target: params.primary,
      prompt: params.prompt,
      system: params.system,
      timeoutMs: params.timeoutMs
    });

    attempts.push(primaryResult.attempt);
    return {
      text: primaryResult.text,
      activeTarget: params.primary,
      fallbackTarget: params.fallback,
      mode: "primary",
      attempts
    } satisfies FailoverResult;
  } catch (error) {
    const primaryFailure = error as { attempt: ModelAttempt };
    attempts.push(primaryFailure.attempt);

    if (
      !params.fallback ||
      (params.fallback.baseUrl === params.primary.baseUrl &&
        params.fallback.model === params.primary.model)
    ) {
      throw Object.assign(new Error(primaryFailure.attempt.error ?? "Primary model failed."), {
        attempts
      });
    }
  }

  try {
    const fallbackResult = await invokeTarget({
      target: params.fallback as ModelTarget,
      prompt: params.prompt,
      system: params.system,
      timeoutMs: params.timeoutMs
    });

    attempts.push(fallbackResult.attempt);
    return {
      text: fallbackResult.text,
      activeTarget: params.fallback as ModelTarget,
      fallbackTarget: params.primary,
      mode: "fallback",
      attempts
    } satisfies FailoverResult;
  } catch (error) {
    const fallbackFailure = error as { attempt: ModelAttempt };
    attempts.push(fallbackFailure.attempt);

    throw Object.assign(
      new Error(fallbackFailure.attempt.error ?? "Fallback model failed."),
      { attempts }
    );
  }
}
