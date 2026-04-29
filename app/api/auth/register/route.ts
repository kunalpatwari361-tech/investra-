import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { AppAuthError, createAppSessionToken, setAppSessionCookie } from "@/lib/auth";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createUser, toAppUserProfile, UserStoreError } from "@/lib/user-store";

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

function createRegisterErrorResponse(error: unknown) {
  const fallbackMessage = "Unable to create your account right now.";

  if (error instanceof AppAuthError) {
    return {
      status: error.status,
      code: "AUTH_CONFIGURATION_ERROR",
      message: error.message
    };
  }

  if (error instanceof UserStoreError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  const resolvedMessage = getErrorMessage(error, fallbackMessage);

  if (resolvedMessage.includes("already exists")) {
    return {
      status: 409,
      code: "DUPLICATE_EMAIL",
      message: resolvedMessage
    };
  }

  return {
    status: 500,
    code: "REGISTER_FAILED",
    message: fallbackMessage
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

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
    const { status, code, message } = createRegisterErrorResponse(error);
    logDebugError(error, `api/auth/register:${requestId}:${code}`);

    return NextResponse.json(
      { success: false, error: message, code, requestId },
      { status }
    );
  }
}
