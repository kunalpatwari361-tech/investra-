import { NextResponse } from "next/server";
import { AppAuthError, requireAuthenticatedUser } from "@/lib/auth";
import {
  enforceQueryRateLimit,
  QueryApiError,
  readQueryPayload
} from "@/lib/api-service";
import { answerAssistantQuery } from "@/lib/assistant-query";
import { createChatRecord } from "@/lib/chat-persistence";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import type { QueryResponse, QueryStreamEvent } from "@/types/chat";

const FALLBACK_MESSAGE = "Sorry, I couldn't process that request. Please try again.";

async function persistQueryChat(
  userId: string | undefined,
  input: string,
  result: QueryResponse
) {
  try {
    await createChatRecord({
      userId,
      message: input,
      response: result.reply.summary,
      model: result.meta.activeModel ?? "unknown"
    });
  } catch (error) {
    logDebugError(error, "api/query.persistQueryChat");
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST for assistant queries." },
    { status: 405 }
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    enforceQueryRateLimit(request);
    const body = await readQueryPayload(request);

    if (!body.stream) {
      const result = await answerAssistantQuery({
        input: body.input,
        selectedModel: body.selectedModel
      });
      await persistQueryChat(user.id, body.input, result);

      return NextResponse.json({
        answer: result.reply.summary,
        models_used: result.meta.modelsUsed ?? [result.meta.activeModel ?? "pipeline"]
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await answerAssistantQuery({
            input: body.input,
            selectedModel: body.selectedModel
          });

          const finalEvent = {
            type: "final",
            data: result
          } satisfies QueryStreamEvent;

          controller.enqueue(encoder.encode(`${JSON.stringify(finalEvent)}\n`));
          await persistQueryChat(user.id, body.input, result);
        } catch (error) {
          logDebugError(error, "api/query.POST.stream");
          const errorEvent = {
            type: "error",
            message: getErrorMessage(error, FALLBACK_MESSAGE)
          } satisfies QueryStreamEvent;

          controller.enqueue(encoder.encode(`${JSON.stringify(errorEvent)}\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppAuthError) {
      return NextResponse.json(
        {
          error: error.message
        },
        { status: error.status }
      );
    }

    if (error instanceof QueryApiError) {
      const retryAfterSeconds =
        "retryAfterSeconds" in error
          ? Number((error as QueryApiError & { retryAfterSeconds?: number }).retryAfterSeconds)
          : undefined;

      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: error.status,
          headers: retryAfterSeconds
            ? {
                "Retry-After": String(retryAfterSeconds)
              }
            : undefined
        }
      );
    }

    logDebugError(error, "api/query.POST");
    return NextResponse.json(
      {
        error: getErrorMessage(error, FALLBACK_MESSAGE)
      },
      { status: 500 }
    );
  }
}
