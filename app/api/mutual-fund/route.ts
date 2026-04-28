import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import { getMutualFundHistory } from "@/lib/services/mfService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();

  if (!code) {
    return NextResponse.json(createErrorEnvelope("mfapi", "code is required."), {
      status: 400
    });
  }

  try {
    return NextResponse.json(await getMutualFundHistory(code));
  } catch (error: unknown) {
    logDebugError(error, `api/mutual-fund.${code}`);
    return NextResponse.json(
      createErrorEnvelope("mfapi", getErrorMessage(error, "Unable to load mutual fund data.")),
      { status: 500 }
    );
  }
}
