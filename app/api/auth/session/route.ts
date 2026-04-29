import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthApiErrorResponse } from "@/lib/auth-api-utils";
import { clearAppSessionCookie, getCurrentUserFromCookies } from "@/lib/auth";
import { logDebugError } from "@/lib/error-utils";

export async function GET() {
  const requestId = crypto.randomUUID();

  try {
    const user = await getCurrentUserFromCookies();

    if (!user) {
      const response = NextResponse.json({ success: false, authenticated: false }, { status: 401 });
      clearAppSessionCookie(response);
      return response;
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user
    });
  } catch (error: unknown) {
    const { status, code, message } = createAuthApiErrorResponse(error, "Unable to read session.");
    logDebugError(error, `api/auth/session:${requestId}:${code}`);

    return NextResponse.json(
      { success: false, authenticated: false, error: message, code, requestId },
      { status }
    );
  }
}
