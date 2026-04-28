import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI?.trim() ||
  process.env.MONGO_URI?.trim() ||
  "mongodb://127.0.0.1:27017/tradesense";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache__: MongooseCache | undefined;
}

const globalCache = global.__mongooseCache__ ?? {
  conn: null,
  promise: null
};

global.__mongooseCache__ = globalCache;

export async function connectDB() {
  if (globalCache.conn) {
    return globalCache.conn;
  }

  if (!globalCache.promise) {
    globalCache.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "tradesense",
        bufferCommands: false
      })
      .catch((error) => {
        globalCache.promise = null;
        throw error;
      });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
