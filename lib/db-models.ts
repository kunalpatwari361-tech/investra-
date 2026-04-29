import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "users",
    versionKey: false
  }
);

const chatSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true, trim: true },
    response: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "chats",
    versionKey: false
  }
);

const transactionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    date: { type: Date, required: true, default: Date.now }
  },
  {
    collection: "transactions",
    versionKey: false
  }
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export type ChatDocument = InferSchemaType<typeof chatSchema>;
export type TransactionDocument = InferSchemaType<typeof transactionSchema>;

export const AuthUserModel =
  (mongoose.models.AtlasAuthUser as Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("AtlasAuthUser", userSchema);

export const ChatModel =
  (mongoose.models.Chat as Model<ChatDocument> | undefined) ??
  mongoose.model<ChatDocument>("Chat", chatSchema);

export const TransactionModel =
  (mongoose.models.Transaction as Model<TransactionDocument> | undefined) ??
  mongoose.model<TransactionDocument>("Transaction", transactionSchema);
