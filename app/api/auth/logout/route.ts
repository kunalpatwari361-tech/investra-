import { NextResponse } from "next/server";
import { clearAppSessionCookie } from "@/lib/auth";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";

export async function POST(request: Request) {
  try {
    const response = NextResponse.json({ success: true });
    clearAppSessionCookie(response);
    return response;
  } catch (error: unknown) {
    logDebugError(error, "api/auth/logout");
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "Unable to log out.") },
      { status: 500 }
    );
  }
}
