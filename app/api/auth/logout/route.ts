import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthApiErrorResponse } from "@/lib/auth-api-utils";
import { clearAppSessionCookie } from "@/lib/auth";
import { logDebugError } from "@/lib/error-utils";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const response = NextResponse.json({ success: true });
    clearAppSessionCookie(response);
    return response;
  } catch (error: unknown) {
    const { status, code, message } = createAuthApiErrorResponse(error, "Unable to log out.");
    logDebugError(error, `api/auth/logout:${requestId}:${code}`);

    return NextResponse.json(
      { success: false, error: message, code, requestId },
      { status }
    );
  }
}
