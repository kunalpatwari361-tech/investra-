import { NextResponse } from "next/server";
import { AppAuthError, requireAuthenticatedUser } from "@/lib/auth";
import { createChatRecord, listChatRecords } from "@/lib/chat-persistence";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";

type ChatPayload = {
  userId?: string;
  message?: string;
  response?: string;
  model?: string;
  createdAt?: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const chats = await listChatRecords(user.id);
    return NextResponse.json(chats);
  } catch (error: unknown) {
    logDebugError(error, "api/chat.GET");

    if (error instanceof AppAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to fetch chats.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as ChatPayload;
    const message = body.message?.trim();
    const response = body.response?.trim();
    const model = body.model?.trim();

    if (!message || !response || !model) {
      return NextResponse.json(
        { error: "message, response, and model are required." },
        { status: 400 }
      );
    }

    const createdAt = body.createdAt ? new Date(body.createdAt) : undefined;

    if (createdAt && Number.isNaN(createdAt.valueOf())) {
      return NextResponse.json({ error: "createdAt must be a valid date." }, { status: 400 });
    }

    const chat = await createChatRecord({
      userId: user.id,
      message,
      response,
      model,
      createdAt
    });

    return NextResponse.json(chat, { status: 201 });
  } catch (error: unknown) {
    logDebugError(error, "api/chat.POST");

    if (error instanceof AppAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to save chat.") },
      { status: 500 }
    );
  }
}
