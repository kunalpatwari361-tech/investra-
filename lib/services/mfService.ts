import {
  getHistory,
  getLatestNAV,
  getMutualFundErrorMessage,
  listFunds,
  searchFund,
  type MutualFundHistory,
  type MutualFundLatest,
  type MutualFundMatch
} from "@/services/mf";
import { createSuccessEnvelope } from "@/lib/services/api-utils";

export function getMfErrorMessage(error: unknown) {
  return getMutualFundErrorMessage(error);
}

export async function searchMutualFunds(query: string) {
  return createSuccessEnvelope("mfapi", await searchFund(query));
}

export async function listMutualFunds() {
  return createSuccessEnvelope("mfapi", await listFunds());
}

export async function getMutualFundLatestNav(code: number | string) {
  return createSuccessEnvelope("mfapi", await getLatestNAV(code));
}

export async function getMutualFundHistory(code: number | string) {
  return createSuccessEnvelope("mfapi", await getHistory(code));
}

export type { MutualFundHistory, MutualFundLatest, MutualFundMatch };
