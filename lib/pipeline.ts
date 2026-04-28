import type { PipelineStep } from "@/types/chat";

export const pipelineSteps: PipelineStep[] = [
  {
    id: "intent",
    label: "Request understanding",
    emoji: "AI",
    description: "Classifying the request and choosing the right backend route.",
    status: "pending"
  },
  {
    id: "tools",
    label: "Model routing",
    emoji: "FX",
    description: "Selecting the primary model and preparing failover behavior.",
    status: "pending"
  },
  {
    id: "fetch",
    label: "Context enrichment",
    emoji: "DB",
    description: "Fetching MFAPI and NSE context only when it adds value.",
    status: "pending"
  },
  {
    id: "response",
    label: "Structured response",
    emoji: "OK",
    description: "Generating a visual-ready response payload for the frontend.",
    status: "pending"
  }
];
