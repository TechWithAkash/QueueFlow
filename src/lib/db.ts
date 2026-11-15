import mongoose from "mongoose";

/**
 * In development, `npm run dev` boots a local MongoDB replica set
 * (scripts/dev-db.ts) on port 27018, so no setup is needed.
 * In production, MONGODB_URI must point at MongoDB Atlas (or any replica set).
 */
const DEV_URI = "mongodb://127.0.0.1:27018/queueflow?replicaSet=rs0&directConnection=true";

function resolveUri(): string {
  const uri = process.env.MONGODB_URI;
  if (uri) return uri;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is not set");
  }
  return DEV_URI;
}

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = g.__mongoose ?? (g.__mongoose = { conn: null, promise: null });

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(resolveUri(), { bufferCommands: false, serverSelectionTimeoutMS: 15000 })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
