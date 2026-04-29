import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAuthApiErrorResponse } from "@/lib/auth-api-utils";
import { createAppSessionToken, setAppSessionCookie } from "@/lib/auth";
import { logDebugError, readJsonBody } from "@/lib/error-utils";
import { createUser, toAppUserProfile } from "@/lib/user-store";

type RegisterPayload = {
  email?: string;
  password?: string;
};

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const body = await readJsonBody<RegisterPayload>(request);
    const email = body.email?.trim();
    const password = body.password?.trim();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(normalizeEmail(email), passwordHash);
    const token = createAppSessionToken({
      userId: user.id,
      email: user.email
    });
    const response = NextResponse.json({
      success: true,
      authenticated: true,
      token,
      user: toAppUserProfile(user)
    });

    setAppSessionCookie(
      response,
      {
        userId: user.id,
        email: user.email
      },
      token
    );

    return response;
  } catch (error: unknown) {
    const { status, code, message } = createAuthApiErrorResponse(
      error,
      "Unable to create your account right now."
    );
    logDebugError(error, `api/auth/register:${requestId}:${code}`);

    return NextResponse.json(
      { success: false, error: message, code, requestId },
      { status }
    );
  }
}
