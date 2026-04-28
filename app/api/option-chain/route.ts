import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getNseOptionChain } from "@/lib/services/stockService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() || "NIFTY";

  try {
    return NextResponse.json(await getNseOptionChain(symbol));
  } catch (error: unknown) {
    logDebugError(error, `api/option-chain.${symbol}`);
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load option chain.")),
      { status: 500 }
    );
  }
}
