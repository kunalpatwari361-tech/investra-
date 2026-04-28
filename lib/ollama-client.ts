export type GenerateOptions = {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  stream?: boolean;
  timeoutMs?: number;
  baseUrl?: string;
};

export type StreamOptions = GenerateOptions & {
  onToken: (token: string) => Promise<void> | void;
};

export type RemoteModelOptions = {
  url: string;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  timeoutMs?: number;
};

type OllamaResponseChunk = {
  response?: string;
  done?: boolean;
};

const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ??
  process.env.OLLAMA_PHI_URL ??
  "http://127.0.0.1:11434";
const MAX_OLLAMA_TIMEOUT_MS = 180_000;
const MAX_OLLAMA_ATTEMPTS = 2;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function resolveTimeout(timeoutMs?: number) {
  const safeTimeout = timeoutMs ?? MAX_OLLAMA_TIMEOUT_MS;
  return Math.min(Math.max(safeTimeout, 1_000), MAX_OLLAMA_TIMEOUT_MS);
}

function getAbortMessage(timeoutMs: number) {
  return `Model request timed out after ${timeoutMs}ms.`;
}

async function postGenerate(options: GenerateOptions) {
  const timeoutMs = resolveTimeout(options.timeoutMs);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_OLLAMA_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${normalizeBaseUrl(options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL)}/api/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: options.model,
            prompt: options.prompt,
            system: options.system,
            stream: options.stream ?? false,
            options: {
              temperature: options.temperature ?? 0.2
            }
          }),
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        const failure = Object.assign(new Error(`Model call failed with ${response.status}`), {
          status: response.status
        });

        if (response.status >= 500 && attempt < MAX_OLLAMA_ATTEMPTS) {
          lastError = failure;
          continue;
        }

        throw failure;
      }

      return response;
    } catch (error) {
      const normalizedError =
        error instanceof Error && error.name === "AbortError"
          ? new Error(getAbortMessage(timeoutMs))
          : error instanceof Error
            ? error
            : new Error("Model request failed.");

      const status =
        "status" in normalizedError
          ? Number((normalizedError as Error & { status?: number }).status)
          : undefined;
      const shouldRetry =
        attempt < MAX_OLLAMA_ATTEMPTS &&
        (status === undefined || Number.isNaN(status) || status >= 500);

      if (shouldRetry) {
        lastError = normalizedError;
        continue;
      }

      throw normalizedError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Model request failed.");
}

export async function generateText(options: GenerateOptions) {
  const response = await postGenerate({
    ...options,
    stream: false
  });
  const data = (await response.json()) as OllamaResponseChunk;

  if (!data.response) {
    throw new Error("Model returned an empty response.");
  }

  return data.response.trim();
}

export async function callRemoteModel(options: RemoteModelOptions) {
  return generateText({
    baseUrl: options.url,
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs
  });
}

export async function streamText(options: StreamOptions) {
  const response = await postGenerate({
    ...options,
    stream: true
  });

  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const chunk = JSON.parse(trimmed) as OllamaResponseChunk;
      const token = chunk.response ?? "";

      if (token) {
        fullText += token;
        await options.onToken(token);
      }

      if (chunk.done) {
        return fullText.trim();
      }
    }
  }

  const finalChunk = buffer.trim();

  if (finalChunk) {
    const chunk = JSON.parse(finalChunk) as OllamaResponseChunk;
    const token = chunk.response ?? "";

    if (token) {
      fullText += token;
      await options.onToken(token);
    }
  }

  return fullText.trim();
}

export async function streamRemoteModel(
  options: RemoteModelOptions & {
    onToken: StreamOptions["onToken"];
  }
) {
  return streamText({
    baseUrl: options.url,
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    onToken: options.onToken
  });
}
