import { getAiEndpoints } from "@/lib/services/aiService";

type ModelEndpointConfig = {
  label: string;
  model: string;
  url: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

const HEALTH_TIMEOUT_MS = 8_000;
const startupHealthCheck = {
  promise: null as Promise<void> | null
};

function getConfiguredEndpoints(): ModelEndpointConfig[] {
  return getAiEndpoints();
}

async function fetchTags(baseUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    return (await response.json()) as OllamaTagsResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`timed out after ${HEALTH_TIMEOUT_MS}ms`);
    }

    throw error instanceof Error ? error : new Error("unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkEndpoint(endpoint: ModelEndpointConfig) {
  try {
    const payload = await fetchTags(endpoint.url);
    const models = payload.models ?? [];
    const hasModel = models.some(
      (entry) => entry.name === endpoint.model || entry.model === endpoint.model
    );

    console.info(
      `[startup-health] ${endpoint.label} model endpoint reachable: ${endpoint.url} | model ${endpoint.model} ${hasModel ? "available" : "missing"}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      `[startup-health] ${endpoint.label} model endpoint failed: ${endpoint.url} | ${message}`
    );
  }
}

export async function runStartupModelHealthCheck() {
  if (!startupHealthCheck.promise) {
    startupHealthCheck.promise = (async () => {
      const endpoints = getConfiguredEndpoints();
      await Promise.all(endpoints.map((endpoint) => checkEndpoint(endpoint)));
    })();
  }

  return startupHealthCheck.promise;
}
