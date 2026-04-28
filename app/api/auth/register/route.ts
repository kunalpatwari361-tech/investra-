import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createUser, toAppUserProfile } from "@/lib/user-store";
import { createAppSessionToken, setAppSessionCookie } from "@/lib/auth";

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
  try {
    const body = (await request.json()) as RegisterPayload;
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
    const resolvedMessage = getErrorMessage(error, "Unable to create your account right now.");
    const message = resolvedMessage.includes("already exists")
      ? resolvedMessage
      : "Unable to create your account right now.";

    logDebugError(error, "api/auth/register");

    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("already exists") ? 409 : 500 }
    );
  }
}
