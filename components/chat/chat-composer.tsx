"use client";

import { LoaderCircle, SendHorizontal } from "lucide-react";
import { startTransition, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { useToastStore } from "@/store/toast-store";

export function ChatComposer() {
  const [input, setInput] = useState("");
  const isProcessing = useChatStore((state) => state.isProcessing);
  const submitQuery = useChatStore((state) => state.submitQuery);
  const addToast = useToastStore((state) => state.addToast);

  async function handleSubmit() {
    const trimmed = input.trim();

    if (!trimmed) {
      addToast({
        title: "Nothing to send",
        description: "Type a message first."
      });
      return;
    }

    startTransition(() => {
      setInput("");
    });

    await submitQuery({
      input: trimmed,
      type: "text"
    });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--panel-border)] bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex items-end gap-2 rounded-[28px] border border-[var(--panel-border)] bg-white px-3 py-2 shadow-[var(--soft-shadow)]">
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <textarea
            id="assistant-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!isProcessing) {
                  void handleSubmit();
                }
              }
            }}
            disabled={isProcessing}
            rows={1}
            placeholder="Message the assistant..."
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-6 outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isProcessing}
            className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-white transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send message"
          >
            {isProcessing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          AI can make mistakes. Verify financial decisions independently.
        </p>
      </div>
    </div>
  );
}
