import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getUnifiedQuote } from "@/lib/services/marketDataService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() || "RELIANCE";

  try {
    return NextResponse.json(await getUnifiedQuote(symbol));
  } catch (error: unknown) {
    logDebugError(error, `api/nse.${symbol}`);
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load NSE quote.")),
      { status: 500 }
    );
  }
}
