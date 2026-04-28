"use client";

import type { ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const failed = message.status === "error";
  const content =
    message.content || (message.status === "streaming" ? "Thinking..." : "");

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-7 shadow-sm sm:max-w-[78%]",
          isUser
            ? "rounded-br-md bg-[#2563eb] text-white"
            : "rounded-bl-md bg-white text-[var(--foreground)]",
          failed
            ? "border border-rose-200 bg-rose-50 text-rose-800"
            : "border border-[var(--panel-border)]"
        )}
      >
        {content}
        {message.status === "streaming" && message.content ? (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current opacity-60" />
        ) : null}
      </div>
    </div>
  );
}
