import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope } from "@/lib/services/api-utils";
import {
  getMutualFundHistory,
  getMutualFundLatestNav,
  listMutualFunds,
  searchMutualFunds
} from "@/lib/services/mfService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope")?.trim() || "search";
  const code = url.searchParams.get("code");
  const query = url.searchParams.get("query")?.trim() || "";

  try {
    if (scope === "latest") {
      if (!code) {
        return NextResponse.json(createErrorEnvelope("mfapi", "code is required."), { status: 400 });
      }

      return NextResponse.json(await getMutualFundLatestNav(code));
    }

    if (scope === "history") {
      if (!code) {
        return NextResponse.json(createErrorEnvelope("mfapi", "code is required."), { status: 400 });
      }

      return NextResponse.json(await getMutualFundHistory(code));
    }

    if (scope === "list") {
      return NextResponse.json(await listMutualFunds());
    }

    return NextResponse.json(await searchMutualFunds(query));
  } catch (error: unknown) {
    logDebugError(error, `api/mf.${scope}`);
    return NextResponse.json(
      createErrorEnvelope("mfapi", getErrorMessage(error, "Unable to load mutual fund data.")),
      { status: 500 }
    );
  }
}
