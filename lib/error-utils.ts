function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecordString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function serializeForDebug(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serializeForDebug(value.cause, seen)
    };
  }

  if (typeof Event !== "undefined" && value instanceof Event) {
    return {
      type: value.type,
      target: value.target ? String(value.target) : undefined
    };
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const output: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(value)) {
    output[key] = serializeForDebug(value[key], seen);
  }

  if (Object.keys(output).length === 0) {
    return String(value);
  }

  return output;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Unexpected error occurred"
): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof Event !== "undefined" && error instanceof Event) {
    return error.type ? `${fallback} (${error.type})` : fallback;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (isRecord(error)) {
    const directMessage = readRecordString(error, [
      "message",
      "error",
      "detail",
      "title",
      "statusText"
    ]);

    if (directMessage) {
      return directMessage;
    }

    if (typeof error.type === "string" && error.type.trim()) {
      return `${fallback} (${error.type})`;
    }

    for (const candidate of [error.error, error.cause, error.reason, error.data, error.response]) {
      const nestedMessage = getErrorMessage(candidate, "");

      if (nestedMessage) {
        return nestedMessage;
      }
    }

    const rendered = String(error);

    if (rendered && rendered !== "[object Object]" && rendered !== "[object Event]") {
      return rendered;
    }
  }

  return fallback;
}

export function toError(error: unknown, fallback = "Unexpected error occurred") {
  if (error instanceof Error) {
    return error;
  }

  return new Error(getErrorMessage(error, fallback));
}

export function logDebugError(error: unknown, context?: string) {
  const normalized = toError(error);

  if (process.env.NODE_ENV === "production") {
    console.error("ERROR:", {
      context,
      name: normalized.name || "Error",
      message: normalized.message || "No message"
    });
    return;
  }

  console.error("DEBUG ERROR:", {
    context,
    name: normalized.name || "Error",
    message: normalized.message || "No message",
    stack: normalized.stack || "No stack",
    raw: serializeForDebug(error)
  });
}

export async function getApiErrorMessage(
  response: Response,
  fallback = "API request failed"
) {
  const responseText = (await response.text()).trim();

  try {
    const payload = JSON.parse(responseText) as { error?: unknown; message?: unknown };

    const parsedMessage = getErrorMessage(payload, "");

    if (parsedMessage) {
      return parsedMessage;
    }

  } catch {
    if (responseText) {
      return responseText;
    }

    return response.status ? `${fallback} (${response.status})` : fallback;
  }

  if (responseText) {
    return responseText;
  }

  return response.status ? `${fallback} (${response.status})` : fallback;
}
