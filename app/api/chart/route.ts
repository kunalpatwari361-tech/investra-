import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getYahooChart } from "@/lib/services/chartService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim() || "RELIANCE";
  const range = url.searchParams.get("range")?.trim() || "1d";
  const interval = url.searchParams.get("interval")?.trim() || "1m";

  try {
    return NextResponse.json(await getYahooChart(symbol, range, interval));
  } catch (error: unknown) {
    logDebugError(error, `api/chart.${symbol}`);
    return NextResponse.json(
      createErrorEnvelope("yahoo", getErrorMessage(error, "Unable to load chart data.")),
      { status: 500 }
    );
  }
}
