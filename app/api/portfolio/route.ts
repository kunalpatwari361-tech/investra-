import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getPortfolioSnapshot } from "@/lib/services/marketDataService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPortfolioSnapshot());
  } catch (error: unknown) {
    logDebugError(error, "api/portfolio");
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load portfolio data.")),
      { status: 500 }
    );
  }
}
