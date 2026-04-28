import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import {
  getMarketOverview,
  getUnifiedQuote,
  listSupportedSymbols
} from "@/lib/services/marketDataService";
import {
  getNseIndices,
} from "@/lib/services/stockService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hasSymbol = url.searchParams.has("symbol");
  const scope = url.searchParams.get("scope")?.trim() || (hasSymbol ? "quote" : "overview");
  const symbol = url.searchParams.get("symbol")?.trim() || "RELIANCE";

  try {
    if (scope === "quote") {
      return NextResponse.json(await getUnifiedQuote(symbol));
    }

    if (scope === "indices") {
      return NextResponse.json(await getNseIndices());
    }

    if (scope === "symbols") {
      return NextResponse.json({
        success: true,
        source: "nse",
        data: listSupportedSymbols(),
        live: true,
        timestamp: Date.now()
      });
    }

    return NextResponse.json(await getMarketOverview());
  } catch (error: unknown) {
    logDebugError(error, `api/stock.${scope}`);
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load stock data.")),
      { status: 500 }
    );
  }
}
