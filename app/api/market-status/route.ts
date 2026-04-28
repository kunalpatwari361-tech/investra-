import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getNseMarketStatus } from "@/lib/services/stockService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getNseMarketStatus());
  } catch (error: unknown) {
    logDebugError(error, "api/market-status");
    return NextResponse.json(
      createErrorEnvelope("nse", getErrorMessage(error, "Unable to load market status.")),
      { status: 500 }
    );
  }
}
