"use client";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatViewport } from "@/components/chat/chat-viewport";
import { EmptyState } from "@/components/chat/empty-state";
import { useChatStore } from "@/store/chat-store";
import { MODEL_OPTIONS, type ModelProvider } from "@/types/model";

export function AssistantView() {
  const messages = useChatStore((state) => state.messages);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const processedBy = useChatStore((state) => state.processedBy);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const activeModelLabel =
    MODEL_OPTIONS.find((option) => option.id === selectedModel)?.label ?? "Phi-3";
  const processedByLabel = processedBy.length
    ? processedBy.map((model) => model.charAt(0).toUpperCase() + model.slice(1)).join(" -> ")
    : activeModelLabel;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col pb-32">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--panel-border)] bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            AI Assistant
          </p>
          <p className="text-sm font-medium">Using: {activeModelLabel}</p>
          <p className="text-xs text-[var(--muted)]">Processed by: {processedByLabel}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Model
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value as ModelProvider)}
            className="rounded-full border border-[var(--panel-border)] bg-transparent px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1">
        {messages.length === 0 ? <EmptyState /> : <ChatViewport />}
      </div>
      <ChatComposer />
    </div>
  );
}
