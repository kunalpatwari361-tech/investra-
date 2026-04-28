import { getApiErrorMessage, getErrorMessage } from "@/lib/error-utils";

type MfSearchResponseItem = {
  schemeCode?: number;
  schemeName?: string;
};

type MfMeta = {
  fund_house?: string;
  scheme_type?: string;
  scheme_category?: string;
  scheme_code?: number;
  scheme_name?: string;
};

type MfNavPoint = {
  date?: string;
  nav?: string;
};

type MfSchemeResponse = {
  meta?: MfMeta;
  data?: MfNavPoint[];
  status?: string;
};

export type MutualFundMatch = {
  schemeCode: number;
  schemeName: string;
};

export type MutualFundLatest = {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeCategory: string;
  nav: string;
  date: string;
};

export type MutualFundHistory = {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeCategory: string;
  latestNav: string;
  latestDate: string;
  points: Array<{
    date: string;
    nav: string;
  }>;
  absoluteChange: string | null;
  percentChange: string | null;
};

const MFAPI_BASE_URL = process.env.MFAPI_BASE_URL ?? "https://api.mfapi.in";
const MFAPI_TIMEOUT_MS = 20_000;
const MAX_SEARCH_RESULTS = 8;
const MAX_LIST_RESULTS = 12;
const MAX_HISTORY_POINTS = 10;

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureSuccessStatus(payload: MfSchemeResponse) {
  if (payload.status && payload.status !== "SUCCESS") {
    throw new Error(`MFAPI request failed with status ${payload.status}.`);
  }
}

async function fetchMfApi<T>(path: string) {
  const response = await fetch(`${normalizeBaseUrl(MFAPI_BASE_URL)}${path}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    },
    signal: AbortSignal.timeout(MFAPI_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, "MFAPI request failed"));
  }

  return (await response.json()) as T;
}

function normalizeSearchResults(results: MfSearchResponseItem[]) {
  return results
    .filter(
      (item): item is Required<MfSearchResponseItem> =>
        typeof item.schemeCode === "number" && typeof item.schemeName === "string"
    )
    .map((item) => ({
      schemeCode: item.schemeCode,
      schemeName: item.schemeName.trim()
    }));
}

function extractLatest(payload: MfSchemeResponse) {
  ensureSuccessStatus(payload);

  const meta = payload.meta;
  const latest = payload.data?.[0];

  if (!meta?.scheme_code || !meta.scheme_name || !latest?.nav || !latest.date) {
    throw new Error("MFAPI latest NAV response is missing required fields.");
  }

  return {
    schemeCode: meta.scheme_code,
    schemeName: meta.scheme_name,
    fundHouse: meta.fund_house ?? "Unknown fund house",
    schemeCategory: meta.scheme_category ?? "Unknown category",
    nav: latest.nav,
    date: latest.date
  } satisfies MutualFundLatest;
}

export async function searchFund(name: string) {
  const query = name.trim();

  if (!query) {
    return [] as MutualFundMatch[];
  }

  const payload = await fetchMfApi<MfSearchResponseItem[]>(
    `/mf/search?q=${encodeURIComponent(query)}`
  );

  return normalizeSearchResults(payload).slice(0, MAX_SEARCH_RESULTS);
}

export async function listFunds() {
  const payload = await fetchMfApi<MfSearchResponseItem[]>("/mf");
  return normalizeSearchResults(payload).slice(0, MAX_LIST_RESULTS);
}

export async function getLatestNAV(code: number | string) {
  const payload = await fetchMfApi<MfSchemeResponse>(`/mf/${encodeURIComponent(String(code))}/latest`);
  return extractLatest(payload);
}

export async function getHistory(code: number | string) {
  const payload = await fetchMfApi<MfSchemeResponse>(`/mf/${encodeURIComponent(String(code))}`);
  const latest = extractLatest(payload);
  const points = (payload.data ?? [])
    .filter(
      (point): point is Required<MfNavPoint> =>
        typeof point.date === "string" && typeof point.nav === "string"
    )
    .slice(0, MAX_HISTORY_POINTS)
    .map((point) => ({
      date: point.date,
      nav: point.nav
    }));

  const firstValue = parseNumber(points[0]?.nav);
  const lastValue = parseNumber(points[points.length - 1]?.nav);
  const absoluteChange =
    firstValue !== null && lastValue !== null ? (firstValue - lastValue).toFixed(4) : null;
  const percentChange =
    firstValue !== null && lastValue !== null && lastValue !== 0
      ? (((firstValue - lastValue) / lastValue) * 100).toFixed(2)
      : null;

  return {
    ...latest,
    latestNav: latest.nav,
    latestDate: latest.date,
    points,
    absoluteChange,
    percentChange
  } satisfies MutualFundHistory;
}

export function getMutualFundErrorMessage(error: unknown) {
  return getErrorMessage(error, "Unable to fetch mutual fund data right now.");
}
