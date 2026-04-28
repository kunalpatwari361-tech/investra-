import { NextResponse } from "next/server";
import { callEc2Api, Ec2ApiError } from "@/lib/ec2-api-client";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { createErrorEnvelope, createSuccessEnvelope } from "@/lib/services/api-utils";

export const dynamic = "force-dynamic";

const GET_ENDPOINTS = new Set(["/health", "/portfolio"]);
const POST_ENDPOINTS = new Set(["/market/intraday", "/signal", "/ai/analyze"]);

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

async function resolveEndpoint(request: Request, context: RouteContext) {
  const params = await context.params;
  const pathname = `/${(params.path ?? []).join("/")}`;
  const url = new URL(request.url);

  return `${pathname}${url.search}`;
}

function withoutQuery(endpoint: string) {
  return endpoint.split("?")[0];
}

async function readJsonBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function proxyError(error: unknown) {
  if (error instanceof Ec2ApiError) {
    return NextResponse.json(
      createErrorEnvelope("ec2", error.message, {
        attempts: error.attempts
      }),
      { status: error.status }
    );
  }

  logDebugError(error, "api/ec2.proxy");
  return NextResponse.json(
    createErrorEnvelope("ec2", getErrorMessage(error, "Unable to reach EC2 API.")),
    { status: 500 }
  );
}

export async function GET(request: Request, context: RouteContext) {
  const endpoint = await resolveEndpoint(request, context);

  if (!GET_ENDPOINTS.has(withoutQuery(endpoint))) {
    return NextResponse.json(createErrorEnvelope("ec2", "Endpoint is not allowed."), {
      status: 404
    });
  }

  try {
    const result = await callEc2Api(endpoint, undefined, {
      method: "GET",
      timeoutMs: 5_000
    });

    return NextResponse.json(
      createSuccessEnvelope("ec2", result.data, {
        server: result.server,
        attempts: result.attempts
      })
    );
  } catch (error: unknown) {
    return proxyError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const endpoint = await resolveEndpoint(request, context);

  if (!POST_ENDPOINTS.has(withoutQuery(endpoint))) {
    return NextResponse.json(createErrorEnvelope("ec2", "Endpoint is not allowed."), {
      status: 404
    });
  }

  const body = await readJsonBody(request);

  if (body === null) {
    return NextResponse.json(createErrorEnvelope("ec2", "Invalid JSON body."), {
      status: 400
    });
  }

  try {
    const result = await callEc2Api(endpoint, body, {
      method: "POST",
      timeoutMs: 10_000
    });

    return NextResponse.json(
      createSuccessEnvelope("ec2", result.data, {
        server: result.server,
        attempts: result.attempts
      })
    );
  } catch (error: unknown) {
    return proxyError(error);
  }
}
