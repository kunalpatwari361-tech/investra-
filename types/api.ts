export type ApiSource =
  | "nse"
  | "yahoo"
  | "mfapi"
  | "ai"
  | "ec2"
  | "cache";

export type ApiSuccessEnvelope<T> = {
  success: true;
  source: ApiSource;
  data: T;
  live: true;
  timestamp: number;
  meta?: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  success: false;
  source: ApiSource;
  data: null;
  live: false;
  error: string;
  timestamp: number;
  meta?: Record<string, unknown>;
};

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
