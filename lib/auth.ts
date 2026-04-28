import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findUserById, toAppUserProfile, type AppUserProfile } from "@/lib/user-store";

export type AppSession = {
  userId: string;
  email: string;
};

type AppSessionTokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

const APP_SESSION_COOKIE_NAME = "atlas_app_session";
const APP_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export class AppAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AppAuthError";
    this.status = status;
  }
}

function getRequiredAuthSecret() {
  const secret =
    process.env.JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "atlas-dev-session-secret" : "");

  if (!secret) {
    throw new AppAuthError("JWT_SECRET is not configured on the server.", 500);
  }

  return secret;
}

function getCookieConfig(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(unsignedToken: string) {
  return crypto.createHmac("sha256", getRequiredAuthSecret()).update(unsignedToken).digest("base64url");
}

function parseSessionPayload(payload: unknown): AppSession | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.sub !== "string" || typeof candidate.email !== "string") {
    return null;
  }

  if (
    typeof candidate.exp !== "number" ||
    typeof candidate.iat !== "number" ||
    candidate.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return {
    userId: candidate.sub,
    email: candidate.email
  };
}

function createSessionPayload(session: AppSession): AppSessionTokenPayload {
  const issuedAt = Math.floor(Date.now() / 1000);

  return {
    sub: session.userId,
    email: session.email,
    iat: issuedAt,
    exp: issuedAt + APP_SESSION_MAX_AGE_SECONDS
  };
}

function readCookieFromHeader(headerValue: string | null, cookieName: string) {
  if (!headerValue) {
    return null;
  }

  const cookiesFromHeader = headerValue.split(";").map((part) => part.trim());

  for (const entry of cookiesFromHeader) {
    if (!entry.startsWith(`${cookieName}=`)) {
      continue;
    }

    return entry.slice(cookieName.length + 1);
  }

  return null;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

function verifyAppSessionToken(token: string) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");

  if (!headerPart || !payloadPart || !signaturePart) {
    return null;
  }

  const unsignedToken = `${headerPart}.${payloadPart}`;
  const expectedSignature = signToken(unsignedToken);

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expectedSignature))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadPart)) as unknown;
    return parseSessionPayload(payload);
  } catch {
    return null;
  }
}

async function getUserFromSession(session: AppSession | null) {
  if (!session) {
    return null;
  }

  const user = await findUserById(session.userId);

  if (!user || user.email !== session.email) {
    return null;
  }

  return user;
}

export function createAppSessionToken(session: AppSession) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify(createSessionPayload(session)));
  const unsignedToken = `${header}.${payload}`;
  const signature = signToken(unsignedToken);
  return `${unsignedToken}.${signature}`;
}

export async function getAppSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;
  return token ? verifyAppSessionToken(token) : null;
}

export async function getAppSessionFromRequest(request: Request) {
  const token =
    readBearerToken(request) ??
    readCookieFromHeader(request.headers.get("cookie"), APP_SESSION_COOKIE_NAME);

  return token ? verifyAppSessionToken(token) : null;
}

export async function getCurrentUserFromCookies(): Promise<AppUserProfile | null> {
  const user = await getUserFromSession(await getAppSessionFromCookies());
  return user ? toAppUserProfile(user) : null;
}

export async function getCurrentUserFromRequest(request: Request): Promise<AppUserProfile | null> {
  const user = await getUserFromSession(await getAppSessionFromRequest(request));
  return user ? toAppUserProfile(user) : null;
}

export async function requireAuthenticatedUser(request?: Request) {
  const user = request
    ? await getCurrentUserFromRequest(request)
    : await getCurrentUserFromCookies();

  if (!user) {
    throw new AppAuthError("Authentication required.", 401);
  }

  return user;
}

export function setAppSessionCookie(response: NextResponse, session: AppSession, token?: string) {
  response.cookies.set(
    APP_SESSION_COOKIE_NAME,
    token ?? createAppSessionToken(session),
    getCookieConfig(APP_SESSION_MAX_AGE_SECONDS)
  );
}

export function clearAppSessionCookie(response: NextResponse) {
  response.cookies.set(APP_SESSION_COOKIE_NAME, "", {
    ...getCookieConfig(0),
    maxAge: 0
  });
}
