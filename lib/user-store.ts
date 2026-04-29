import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthUserModel } from "@/lib/db-models";
import { connectDB } from "@/lib/mongodb";

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type AppUserProfile = {
  id: string;
  email: string;
  createdAt: string;
};

type MongoUserRecord = {
  _id: { toString(): string };
  email: string;
  passwordHash: string;
  createdAt: Date | string;
};

export class UserStoreError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "USER_STORE_ERROR", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UserStoreError";
    this.status = status;
    this.code = code;
  }
}

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const USERS_FILE_PATH = path.join(DATA_DIRECTORY, "users.json");
let mutationQueue = Promise.resolve();
let mongoUserStoreAvailable: boolean | null = null;
let hasWarnedAboutEphemeralUserStore = false;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function useMongoUserStore() {
  return Boolean(process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim());
}

export function warnIfUserStoreIsEphemeral() {
  if (process.env.NODE_ENV !== "production" || useMongoUserStore() || hasWarnedAboutEphemeralUserStore) {
    return;
  }

  hasWarnedAboutEphemeralUserStore = true;
  console.warn(
    "AUTH WARNING: MONGODB_URI is not configured. Production signup will use local file storage, which is ephemeral on hosts like Render."
  );
}

async function canUseMongoUserStore() {
  if (!useMongoUserStore()) {
    return false;
  }

  if (mongoUserStoreAvailable !== null) {
    return mongoUserStoreAvailable;
  }

  try {
    await connectDB();
    mongoUserStoreAvailable = true;
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new UserStoreError(
        "Database connection failed. Check MONGODB_URI, MongoDB network access, and MONGODB_DB_NAME if you set one.",
        503,
        "DATABASE_UNAVAILABLE",
        { cause: error }
      );
    }

    mongoUserStoreAvailable = false;
    return false;
  }
}

function mapMongoUser(user: MongoUserRecord): StoredUser {
  return {
    id: user._id.toString(),
    email: normalizeEmail(user.email),
    passwordHash: user.passwordHash,
    createdAt:
      user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt)
  };
}

function sanitizeStoredUser(candidate: unknown): StoredUser | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.email !== "string" ||
    typeof record.passwordHash !== "string" ||
    typeof record.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    email: normalizeEmail(record.email),
    passwordHash: record.passwordHash,
    createdAt: record.createdAt
  };
}

async function ensureStore() {
  await mkdir(DATA_DIRECTORY, { recursive: true });

  try {
    await readFile(USERS_FILE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    await writeFile(USERS_FILE_PATH, "[]\n", "utf8");
  }
}

async function readUsersFromFile() {
  await ensureStore();
  const raw = await readFile(USERS_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    return [] as StoredUser[];
  }

  return parsed
    .map((entry) => sanitizeStoredUser(entry))
    .filter((entry): entry is StoredUser => entry !== null);
}

async function writeUsersToFile(users: StoredUser[]) {
  await ensureStore();
  const tempPath = `${USERS_FILE_PATH}.${crypto.randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  await rename(tempPath, USERS_FILE_PATH);
}

async function queueMutation<T>(mutate: (users: StoredUser[]) => Promise<T> | T): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const users = await readUsersFromFile();
    const result = await mutate(users);
    await writeUsersToFile(users);
    return result;
  });

  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  );

  return operation;
}

async function findMongoUser(filter: Record<string, unknown>) {
  await connectDB();
  const user = await AuthUserModel.findOne(filter).lean<MongoUserRecord | null>();
  return user ? mapMongoUser(user) : null;
}

export function toAppUserProfile(user: StoredUser): AppUserProfile {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}

export async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);

  if (await canUseMongoUserStore()) {
    return findMongoUser({ email: normalized });
  }

  const users = await readUsersFromFile();
  return users.find((user) => user.email === normalized) ?? null;
}

export async function findUserById(id: string) {
  if (await canUseMongoUserStore()) {
    return findMongoUser({ _id: id });
  }

  const users = await readUsersFromFile();
  return users.find((user) => user.id === id) ?? null;
}

export async function createUser(email: string, passwordHash: string) {
  const normalized = normalizeEmail(email);

  if (await canUseMongoUserStore()) {
    await connectDB();

    const existing = await AuthUserModel.findOne({ email: normalized }).lean();

    if (existing) {
      throw new UserStoreError("An account with this email already exists.", 409, "DUPLICATE_EMAIL");
    }

    try {
      const user = await AuthUserModel.create({
        email: normalized,
        passwordHash,
        createdAt: new Date()
      });

      return mapMongoUser(user.toObject() as MongoUserRecord);
    } catch (error) {
      const duplicateError = error as { code?: number; name?: string };

      if (duplicateError.code === 11000) {
        throw new UserStoreError("An account with this email already exists.", 409, "DUPLICATE_EMAIL", {
          cause: error
        });
      }

      if (duplicateError.name === "ValidationError") {
        throw new UserStoreError(
          "User storage is misconfigured. Check the deployed MongoDB auth schema.",
          500,
          "USER_STORE_SCHEMA_ERROR",
          { cause: error }
        );
      }

      throw error;
    }
  }

  return queueMutation((users) => {
    if (users.some((user) => user.email === normalized)) {
      throw new UserStoreError("An account with this email already exists.", 409, "DUPLICATE_EMAIL");
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email: normalized,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    return user;
  });
}
