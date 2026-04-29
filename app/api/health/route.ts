import { NextResponse } from "next/server";
import { validateAuthConfiguration } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

function isTruthy(value: string | null) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shouldCheckDb = isTruthy(url.searchParams.get("db"));

  const auth = {
    configured: true,
    error: null as string | null
  };

  try {
    validateAuthConfiguration();
  } catch (error) {
    auth.configured = false;
    auth.error = error instanceof Error ? error.message : "Auth configuration invalid.";
  }

  const database = {
    configured: Boolean(process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim()),
    connected: false,
    error: null as string | null
  };

  if (shouldCheckDb && database.configured) {
    try {
      await connectDB();
      database.connected = true;
    } catch (error) {
      database.error = error instanceof Error ? error.message : "Database connection failed.";
    }
  }

  const ok =
    auth.configured &&
    (!shouldCheckDb || !database.configured || database.connected);

  return NextResponse.json(
    {
      ok,
      auth,
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
