import { clsx, type ClassValue } from "clsx";
import type { ChatMessage } from "@/types/chat";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function exportConversation(messages: ChatMessage[], sessionId: string) {
  const markdown = messages
    .map((message) => {
      const heading = message.role === "user" ? "## User" : "## Atlas Wealth AI";
      return `${heading}\n\n${message.rawText ?? message.content}`;
    })
    .join("\n\n");

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `atlas-wealth-session-${sessionId}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatCompactTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
