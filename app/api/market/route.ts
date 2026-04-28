import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getMarketOverview } from "@/lib/services/marketDataService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getMarketOverview());
  } catch (error: unknown) {
    logDebugError(error, "api/market");
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load market data.")),
      { status: 500 }
    );
  }
}
