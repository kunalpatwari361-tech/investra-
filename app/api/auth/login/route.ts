import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAppSessionToken, setAppSessionCookie } from "@/lib/auth";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { findUserByEmail, toAppUserProfile } from "@/lib/user-store";

type LoginPayload = {
  email?: string;
  password?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = body.email?.trim() ?? "";
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "Email and password are required."
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid email address."
        },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(normalizeEmail(email));

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email or password."
        },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email or password."
        },
        { status: 401 }
      );
    }

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
    logDebugError(error, "api/auth/login");
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Server error")
      },
      { status: 500 }
    );
  }
}
