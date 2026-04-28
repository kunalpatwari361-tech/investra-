"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getApiErrorMessage, getErrorMessage, logDebugError } from "@/lib/error-utils";
import type { ChatMessage, QueryResponse, QueryStreamEvent } from "@/types/chat";
import type { ModelProvider } from "@/types/model";

type SubmitPayload = {
  input: string;
  type: "text";
  selectedModel?: ModelProvider;
};

type ChatState = {
  messages: ChatMessage[];
  isProcessing: boolean;
  selectedModel: ModelProvider;
  processedBy: string[];
  lastPayload: SubmitPayload | null;
  setSelectedModel: (model: ModelProvider) => void;
  submitQuery: (payload: SubmitPayload) => Promise<void>;
  retryLast: () => Promise<void>;
  clearMessages: () => void;
};

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function fetchAssistantResponse(payload: SubmitPayload) {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?error=session-expired";
    }

    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, "The assistant request failed."));
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  return response.body.getReader();
}

function updateAssistantMessage(
  messages: ChatMessage[],
  assistantMessageId: string,
  updater: (message: ChatMessage) => ChatMessage
) {
  return messages.map((message) =>
    message.id === assistantMessageId ? updater(message) : message
  );
}

function extractPlainText(response: QueryResponse) {
  const value =
    response.reply.summary ||
    response.reply.markdown ||
    response.reply.explanation ||
    "I could not generate a useful answer.";

  return value.replace(/\n{3,}/g, "\n\n").trim();
}

async function consumeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: QueryStreamEvent) => void
) {
  const decoder = new TextDecoder();
  let buffer = "";

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

      try {
        onEvent(JSON.parse(trimmed) as QueryStreamEvent);
      } catch (error: unknown) {
        throw new Error(getErrorMessage(error, "Unable to parse the assistant response."));
      }
    }
  }

  const trimmed = buffer.trim();

  if (!trimmed) {
    return;
  }

  try {
    onEvent(JSON.parse(trimmed) as QueryStreamEvent);
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error, "Unable to parse the assistant response."));
  }
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isProcessing: false,
      selectedModel: "pipeline",
      processedBy: ["phi3", "mistral", "gamma"],
      lastPayload: null,
      setSelectedModel: (model) => {
        set({ selectedModel: model });
      },
      submitQuery: async (payload) => {
        const selectedModel = payload.selectedModel ?? get().selectedModel;
        const requestPayload = {
          ...payload,
          selectedModel
        };
        const userMessage: ChatMessage = {
          id: createId("user"),
          role: "user",
          content: payload.input
        };
        const assistantMessageId = createId("assistant");
        const assistantPlaceholder: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          rawText: "",
          status: "streaming"
        };

        set((state) => ({
          isProcessing: true,
          lastPayload: requestPayload,
          messages: [...state.messages, userMessage, assistantPlaceholder]
        }));

        try {
          const reader = await fetchAssistantResponse(requestPayload);

          await consumeStream(reader, (event) => {
            if (event.type === "pipeline" || event.type === "meta") {
              return;
            }

            if (event.type === "delta") {
              set((state) => ({
                messages: updateAssistantMessage(
                  state.messages,
                  assistantMessageId,
                  (message) => ({
                    ...message,
                    content: `${message.content}${event.delta}`,
                    rawText: `${message.rawText ?? ""}${event.delta}`,
                    status: "streaming"
                  })
                )
              }));
              return;
            }

            if (event.type === "final") {
              const plainText = extractPlainText(event.data);

              set((state) => ({
                isProcessing: false,
                processedBy: event.data.meta.modelsUsed ?? [event.data.meta.activeModel ?? selectedModel],
                messages: updateAssistantMessage(
                  state.messages,
                  assistantMessageId,
                  () => ({
                    id: assistantMessageId,
                    role: "assistant",
                    content: plainText,
                    rawText: plainText,
                    status: "complete"
                  })
                )
              }));
              return;
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          });
        } catch (error: unknown) {
          logDebugError(error, "chat-store.submitQuery");
          const message = getErrorMessage(error, "The assistant could not complete this request.");

          set((state) => ({
            isProcessing: false,
            messages: updateAssistantMessage(
              state.messages,
              assistantMessageId,
              (entry) => ({
                ...entry,
                content: message,
                rawText: message,
                status: "error"
              })
            )
          }));
        }
      },
      retryLast: async () => {
        const payload = get().lastPayload;
        if (!payload) return;
        await get().submitQuery(payload);
      },
      clearMessages: () => {
        set({ messages: [] });
      }
    }),
    {
      name: "atlas-ai-chat",
      partialize: (state) => ({
        messages: state.messages,
        selectedModel: state.selectedModel,
        processedBy: state.processedBy
      })
    }
  )
);
