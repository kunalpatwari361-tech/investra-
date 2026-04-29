import mongoose from "mongoose";

const DEFAULT_LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27017/tradesense";

function getMongoUri() {
  const configuredUri = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();

  if (configuredUri) {
    return configuredUri;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is not configured.");
  }

  return DEFAULT_LOCAL_MONGODB_URI;
}

function getMongoDbName() {
  return process.env.MONGODB_DB_NAME?.trim() || "tradesense";
}

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
    const mongoUri = getMongoUri();

    globalCache.promise = mongoose
      .connect(mongoUri, {
        dbName: getMongoDbName(),
        bufferCommands: false,
        serverSelectionTimeoutMS: 5_000,
        connectTimeoutMS: 5_000
      })
      .catch((error) => {
        globalCache.promise = null;
        throw error;
      });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
