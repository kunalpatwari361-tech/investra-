import { NextResponse } from "next/server";
import { TransactionModel } from "@/lib/db-models";
import { getErrorMessage, logDebugError } from "@/lib/error-utils";
import { connectDB } from "@/lib/mongodb";
import { resolveAppUserId } from "@/lib/chat-persistence";

type TransactionPayload = {
  userId?: string;
  type?: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  total?: number;
  date?: string;
};

export async function GET(request: Request) {
  try {
    await connectDB();

    const userId = new URL(request.url).searchParams.get("userId");
    const filter = userId?.trim() ? { userId: userId.trim() } : {};
    const transactions = await TransactionModel.find(filter).sort({ date: -1 }).lean();

    return NextResponse.json(transactions);
  } catch (error: unknown) {
    logDebugError(error, "api/transaction.GET");
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to fetch transactions.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();

    const body = (await request.json()) as TransactionPayload;
    const type = body.type?.trim();
    const symbol = body.symbol?.trim()?.toUpperCase();
    const quantity = Number(body.quantity);
    const price = Number(body.price);
    const total = Number(body.total);
    const date = body.date ? new Date(body.date) : new Date();

    if (!type || !symbol || !Number.isFinite(quantity) || !Number.isFinite(price) || !Number.isFinite(total)) {
      return NextResponse.json(
        { error: "type, symbol, quantity, price, and total are required." },
        { status: 400 }
      );
    }

    if (Number.isNaN(date.valueOf())) {
      return NextResponse.json({ error: "date must be a valid date." }, { status: 400 });
    }

    const transaction = await TransactionModel.create({
      userId: resolveAppUserId(body.userId),
      type,
      symbol,
      quantity,
      price,
      total,
      date
    });

    return NextResponse.json(transaction.toObject(), { status: 201 });
  } catch (error: unknown) {
    logDebugError(error, "api/transaction.POST");
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to save transaction.") },
      { status: 500 }
    );
  }
}
