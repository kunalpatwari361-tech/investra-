import { NextResponse } from "next/server";
import { clearAppSessionCookie, getCurrentUserFromCookies } from "@/lib/auth";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";

export async function GET() {
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
    logDebugError(error, "api/auth/session");
    return NextResponse.json(
      { success: false, authenticated: false, error: getErrorMessage(error, "Unable to read session.") },
      { status: 500 }
    );
  }
}
