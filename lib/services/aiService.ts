import { callRemoteModel, generateText } from "@/lib/ollama-client";
import type { GenerateOptions, RemoteModelOptions } from "@/lib/ollama-client";

export type AiEndpointConfig = {
  label: string;
  model: string;
  url: string;
};

export function getAiEndpoints(): AiEndpointConfig[] {
  return [
    {
      label: "fast",
      model: process.env.ROUTER_MODEL ?? "phi3:latest",
      url:
        process.env.OLLAMA_PHI_URL ??
        process.env.OLLAMA_BASE_URL ??
        "http://127.0.0.1:11434"
    },
    {
      label: "reasoning",
      model: process.env.REASONING_MODEL ?? "llama3:8b-instruct-q4_K_M",
      url:
        process.env.OLLAMA_REASONING_URL ??
        process.env.OLLAMA_PHI_URL ??
        process.env.OLLAMA_BASE_URL ??
        "http://127.0.0.1:11434"
    }
  ];
}

export function getFastAiEndpoint() {
  return getAiEndpoints()[0];
}

export function getReasoningAiEndpoint() {
  return getAiEndpoints()[1];
}

export async function generateAiText(options: GenerateOptions) {
  return generateText(options);
}

export async function callAiEndpoint(options: RemoteModelOptions) {
  return callRemoteModel(options);
}
