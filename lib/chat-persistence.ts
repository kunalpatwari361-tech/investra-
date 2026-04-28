import { ChatModel } from "@/lib/db-models";
import { connectDB } from "@/lib/mongodb";

export const DEFAULT_APP_USER_ID = "admin";

type ChatRecordInput = {
  userId?: string | null;
  message: string;
  response: string;
  model: string;
  createdAt?: Date;
};

export function resolveAppUserId(userId?: string | null) {
  const normalized = userId?.trim();
  return normalized ? normalized : DEFAULT_APP_USER_ID;
}

export async function createChatRecord(input: ChatRecordInput) {
  await connectDB();

  const chat = await ChatModel.create({
    userId: resolveAppUserId(input.userId),
    message: input.message.trim(),
    response: input.response.trim(),
    model: input.model.trim() || "unknown",
    createdAt: input.createdAt ?? new Date()
  });

  return chat.toObject();
}

export async function listChatRecords(userId?: string | null) {
  await connectDB();

  const filter = userId?.trim() ? { userId: userId.trim() } : {};
  return ChatModel.find(filter).sort({ createdAt: -1 }).lean();
}
