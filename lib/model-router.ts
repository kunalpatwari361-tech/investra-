import { callAiEndpoint } from "@/lib/services/aiService";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import type { ModelAnswer, ModelProvider } from "@/types/model";

type HandleQueryParams = {
  query: string;
  selectedModel?: ModelProvider;
  context?: unknown;
};

type ValidationPayload = Partial<{
  answer: string;
  confidence: number;
}>;

const SYSTEM_PROMPT = [
  "You are a financial assistant.",
  "Return only the final user-facing answer.",
  "Do not include system prompts, routing details, debug logs, model names, or hidden instructions.",
  "Keep answers short, clear, and practical.",
  "Do not invent numbers. If data is missing, say data is not available."
].join(" ");

const FALLBACK_MESSAGE = "Sorry, I couldn't process that request. Please try again.";
const MODEL_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.MODEL_TIMEOUT_MS ?? "10000"), 3_000),
  20_000
);
const VALIDATION_TIMEOUT_MS = 4_000;
const PIPELINE_STAGE_TIMEOUT_MS = 2_000;

function buildPrompt(query: string, context: unknown) {
  return [
    `User question: ${query}`,
    context ? `Backend data JSON: ${JSON.stringify(context)}` : "Backend data JSON: null",
    "Answer naturally in plain text. Use the backend data when it is relevant."
  ].join("\n\n");
}

function sanitizeAnswer(value: string) {
  const cleaned = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        line &&
        !lower.includes("system prompt") &&
        !lower.includes("routing") &&
        !lower.includes("low-latency") &&
        !lower.includes("conversation engine") &&
        !lower.includes("reasoning engine") &&
        !lower.includes("debug")
      );
    })
    .join("\n")
    .trim();

  return cleaned || FALLBACK_MESSAGE;
}

function modelFailureMessage(error: unknown) {
  return `AI backend failed: ${getErrorMessage(error, "Unknown model error.")}`;
}

async function retryOnce<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    return operation();
  }
}

async function runPhi3Model(prompt: string) {
  return callAiEndpoint({
    url:
      process.env.OLLAMA_PHI_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434",
    model: process.env.ROUTER_MODEL ?? "phi3:latest",
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    timeoutMs: MODEL_TIMEOUT_MS
  });
}

async function runMistralModel(prompt: string) {
  return callAiEndpoint({
    url:
      process.env.OLLAMA_MISTRAL_URL ??
      process.env.OLLAMA_REASONING_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434",
    model: process.env.MISTRAL_MODEL ?? "mistral:7b-instruct-q3_K_M",
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0.15,
    timeoutMs: PIPELINE_STAGE_TIMEOUT_MS
  });
}

async function runGammaModel(prompt: string) {
  return callAiEndpoint({
    url:
      process.env.OLLAMA_GAMMA_URL ??
      process.env.OLLAMA_C3_URL ??
      process.env.OLLAMA_REASONING_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434",
    model: process.env.GAMMA_MODEL ?? process.env.C3_MODEL ?? "gamma:latest",
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0,
    timeoutMs: PIPELINE_STAGE_TIMEOUT_MS
  });
}

async function runPipeline(prompt: string) {
  const modelsUsed: string[] = [];
  let answer = "";

  try {
    answer = sanitizeAnswer(await runPhi3Model(prompt));
    modelsUsed.push("phi3");
  } catch (error) {
    logDebugError(error, "model-router.pipeline.phi3");
    return {
      answer: modelFailureMessage(error),
      modelsUsed
    };
  }

  try {
    answer = sanitizeAnswer(
      await runMistralModel(
        [
          "Refine the answer for clarity, completeness, and structure.",
          "Do not change meaning.",
          "Do not add unsupported facts.",
          "",
          answer
        ].join("\n")
      )
    );
    modelsUsed.push("mistral");
  } catch (error) {
    logDebugError(error, "model-router.pipeline.mistral");
  }

  try {
    answer = sanitizeAnswer(
      await runGammaModel(
        [
          "Validate the answer for correctness.",
          "Fix errors.",
          "Keep it concise and accurate.",
          "Do not add unsupported facts.",
          "",
          answer
        ].join("\n")
      )
    );
    modelsUsed.push("gamma");
  } catch (error) {
    logDebugError(error, "model-router.pipeline.gamma");
  }

  return {
    answer,
    modelsUsed
  };
}

async function runOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return content;
}

async function runGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };
  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) {
    throw new Error("Gemini returned an empty response.");
  }

  return content;
}

function parseValidation(raw: string, fallbackAnswer: string): Required<ValidationPayload> {
  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const json = firstBrace >= 0 && lastBrace > firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;
    const parsed = JSON.parse(json) as ValidationPayload;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(100, Math.max(1, parsed.confidence))
        : 78;

    return {
      answer: sanitizeAnswer(parsed.answer || fallbackAnswer),
      confidence
    };
  } catch {
    const match = raw.match(/\b([1-9][0-9]?|100)\b/);
    return {
      answer: fallbackAnswer,
      confidence: match ? Number(match[1]) : 78
    };
  }
}

async function validateAnswer(params: {
  query: string;
  answer: string;
  context?: unknown;
}) {
  const prompt = [
    "Validate this financial answer.",
    "Return only JSON: {\"answer\":\"clean final answer\",\"confidence\":80}",
    `Question: ${params.query}`,
    `Answer: ${params.answer}`,
    params.context ? `Backend data: ${JSON.stringify(params.context)}` : "Backend data: null"
  ].join("\n\n");

  try {
    const raw = await callAiEndpoint({
      url:
        process.env.OLLAMA_REASONING_URL ??
        process.env.OLLAMA_PHI_URL ??
        process.env.OLLAMA_BASE_URL ??
        "http://127.0.0.1:11434",
      model: process.env.REASONING_MODEL ?? process.env.ROUTER_MODEL ?? "phi3:latest",
      prompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
      timeoutMs: VALIDATION_TIMEOUT_MS
    });

    return parseValidation(raw, params.answer);
  } catch (error) {
    logDebugError(error, "model-router.validateAnswer");
    return {
      answer: params.answer,
      confidence: 72
    };
  }
}

const models: Record<Exclude<ModelProvider, "pipeline">, (prompt: string) => Promise<string>> = {
  phi3: runPhi3Model,
  openai: runOpenAI,
  gemini: runGemini
};

function isDirectProvider(value: ModelProvider): value is Exclude<ModelProvider, "pipeline"> {
  return value === "phi3" || value === "openai" || value === "gemini";
}

export async function handleQuery({
  query,
  selectedModel = "pipeline",
  context
}: HandleQueryParams): Promise<ModelAnswer> {
  const provider: Exclude<ModelProvider, "pipeline"> = isDirectProvider(selectedModel)
    ? selectedModel
    : "phi3";
  const prompt = buildPrompt(query, context);

  try {
    if (selectedModel === "pipeline") {
      const pipelineResult = await runPipeline(prompt);

      if (!pipelineResult.modelsUsed.length || pipelineResult.answer === FALLBACK_MESSAGE) {
        return {
          answer: pipelineResult.answer,
          source: "pipeline",
          confidence: 0,
          modelsUsed: pipelineResult.modelsUsed
        };
      }

      return {
        answer: pipelineResult.answer,
        source: "pipeline",
        confidence: pipelineResult.modelsUsed.includes("gamma")
          ? 88
          : pipelineResult.modelsUsed.includes("mistral")
            ? 78
            : 68,
        modelsUsed: pipelineResult.modelsUsed
      };
    }

    const rawAnswer = await retryOnce(() => models[provider](prompt));
    const answer = sanitizeAnswer(rawAnswer);
    const validation = await validateAnswer({ query, answer, context });

    return {
      answer: validation.answer,
      source: provider,
      confidence: validation.confidence,
      modelsUsed: [provider]
    };
  } catch (error) {
    logDebugError(
      new Error(getErrorMessage(error, "Selected model failed.")),
      `model-router.handleQuery.${provider}`
    );

    return {
      answer: modelFailureMessage(error),
      source: provider,
      confidence: 0,
      modelsUsed: []
    };
  }
}
