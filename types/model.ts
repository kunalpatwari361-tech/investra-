export type ModelProvider = "pipeline" | "phi3" | "openai" | "gemini";

export type ModelAnswer = {
  answer: string;
  source: ModelProvider;
  confidence?: number;
  modelsUsed?: string[];
};

export const MODEL_OPTIONS: Array<{
  id: ModelProvider;
  label: string;
  description: string;
}> = [
  {
    id: "pipeline",
    label: "Phi-3 -> Mistral -> Gamma",
    description: "Three-stage cloud pipeline"
  },
  {
    id: "phi3",
    label: "Phi-3",
    description: "Default local Ollama model"
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Advanced API model"
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Google API model"
  }
];

export function normalizeModelProvider(value: unknown): ModelProvider {
  return value === "pipeline" || value === "openai" || value === "gemini" || value === "phi3"
    ? value
    : "pipeline";
}
