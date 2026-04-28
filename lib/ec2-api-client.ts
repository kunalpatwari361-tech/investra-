export const DEFAULT_EC2_SERVERS = [
  "http://13.49.67.43:3000",
  "http://13.51.206.231:3000",
  "http://13.51.255.106:3000"
] as const;

type HttpMethod = "GET" | "POST";

type CallOptions = {
  method?: HttpMethod;
  timeoutMs?: number;
  headers?: HeadersInit;
};

export type Ec2CallResult<T> = {
  data: T;
  server: string;
  attempts: Array<{
    server: string;
    ok: boolean;
    status?: number;
    error?: string;
  }>;
};

export class Ec2ApiError extends Error {
  status = 503;
  attempts: Ec2CallResult<unknown>["attempts"];

  constructor(message: string, attempts: Ec2CallResult<unknown>["attempts"]) {
    super(message);
    this.name = "Ec2ApiError";
    this.attempts = attempts;
  }
}

let roundRobinIndex = 0;

function normalizeServer(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function parseConfiguredServers() {
  const configured =
    process.env.NEXT_PUBLIC_EC2_API_SERVERS || process.env.EC2_API_SERVERS || "";
  const parsed = configured
    .split(",")
    .map(normalizeServer)
    .filter((server) => /^https?:\/\//i.test(server));

  return parsed.length ? parsed : [...DEFAULT_EC2_SERVERS];
}

export function getEc2Servers() {
  return parseConfiguredServers();
}

export function getServer(index: number) {
  const servers = getEc2Servers();
  return servers[index % servers.length];
}

function resolveEndpoint(endpoint: string) {
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function parseResponseBody(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readRemoteError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return typeof body === "string" && body.trim() ? body : fallback;
  }

  const record = body as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error.trim() : "";
  const details = typeof record.details === "string" ? record.details.trim() : "";

  if (error && details) {
    return `${error}: ${details}`;
  }

  return error || details || fallback;
}

export async function callEc2Api<T = unknown>(
  endpoint: string,
  data?: unknown,
  options: CallOptions = {}
): Promise<Ec2CallResult<T>> {
  const servers = getEc2Servers();
  const method = options.method ?? "POST";
  const attempts: Ec2CallResult<T>["attempts"] = [];
  const startIndex = roundRobinIndex++ % servers.length;

  for (let offset = 0; offset < servers.length; offset += 1) {
    const server = servers[(startIndex + offset) % servers.length];
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 8_000
    );

    try {
      const response = await fetch(`${server}${resolveEndpoint(endpoint)}`, {
        method,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {})
        },
        body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
        signal: controller.signal
      });
      const text = await response.text();
      const body = parseResponseBody(text);

      if (!response.ok) {
        attempts.push({
          server,
          ok: false,
          status: response.status,
          error: readRemoteError(body, `HTTP ${response.status}`)
        });
        continue;
      }

      attempts.push({ server, ok: true, status: response.status });

      return {
        data: body as T,
        server,
        attempts
      };
    } catch (error: unknown) {
      attempts.push({
        server,
        ok: false,
        error: error instanceof Error ? error.message : "Request failed"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const lastError = [...attempts].reverse().find((attempt) => attempt.error)?.error;

  throw new Ec2ApiError(
    lastError
      ? `All EC2 API servers are unavailable. Last error: ${lastError}`
      : "All EC2 API servers are unavailable.",
    attempts
  );
}

export async function checkEc2Health(timeoutMs = 3_000) {
  const servers = getEc2Servers();

  return Promise.all(
    servers.map(async (server) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${server}/health`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "text/plain, application/json",
            "Cache-Control": "no-cache"
          },
          signal: controller.signal
        });

        return {
          server,
          ok: response.ok,
          status: response.status
        };
      } catch (error: unknown) {
        return {
          server,
          ok: false,
          error: error instanceof Error ? error.message : "Health check failed"
        };
      } finally {
        clearTimeout(timeout);
      }
    })
  );
}
