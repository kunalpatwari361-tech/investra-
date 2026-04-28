export type StepStatus = "pending" | "active" | "complete" | "error";

export type PipelineStep = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  status: StepStatus;
  latencyMs?: number;
};

export type ResponseTableData = {
  columns: string[];
  rows: string[][];
};

export type ChartPoint = {
  label: string;
  value: number;
};

export type VisualHint =
  | "line-chart"
  | "bar-chart"
  | "pie-chart"
  | "table"
  | "timeline"
  | "cards"
  | "stat"
  | "none";

export type StructuredChartData = {
  type: "line" | "bar" | "pie" | "area" | "table" | "stat" | "none";
  title: string;
  data: ChartPoint[];
};

export type StructuredReplyPayload = {
  title: string;
  summary: string;
  explanation: string;
  key_points: string[];
  steps: string[];
  examples: string[];
  visual_hint: VisualHint;
  chart_data: StructuredChartData | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  rawText?: string;
  imageName?: string | null;
  sections?: {
    summary: string;
    analysis: string[];
    recommendation: string;
  };
  markdown?: string;
  table?: ResponseTableData;
  chart?: ChartPoint[];
  status?: "streaming" | "complete" | "error";
};

export type SessionSummary = {
  id: string;
  title: string;
  preview: string;
};

export type QueryResponse = {
  reply: {
    title: string;
    summary: string;
    explanation: string;
    keyPoints: string[];
    steps: string[];
    examples: string[];
    visualHint: VisualHint;
    chartData: StructuredChartData | null;
    structured: StructuredReplyPayload;
    analysis: string[];
    recommendation: string;
    markdown: string;
    table: ResponseTableData;
    chart: ChartPoint[];
  };
  pipeline: PipelineStep[];
  meta: {
    modelMap: Array<{
      label: string;
      role: string;
    }>;
    toolsUsed?: string[];
    dataSources?: string[];
    activeModel?: string;
    fallbackModel?: string;
    route?: {
      category: "simple" | "complex" | "financial";
      mode: "primary" | "fallback" | "degraded";
    };
    attempts?: Array<{
      model: string;
      label: string;
      status: "success" | "error";
      durationMs: number;
      error?: string;
    }>;
    confidenceScore?: number;
    modelsUsed?: string[];
  };
};

export type QueryStreamEvent =
  | {
      type: "pipeline";
      steps: PipelineStep[];
    }
  | {
      type: "meta";
      meta: QueryResponse["meta"];
    }
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "final";
      data: QueryResponse;
    }
  | {
      type: "error";
      message: string;
    };
