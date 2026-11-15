/**
 * Zero-config local database for development.
 * Starts a single-node MongoDB replica set (needed for change streams → real-time)
 * on port 27018 and persists data in ./.data/db between restarts.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdirSync } from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.MONGODB_URI) {
    console.log("[db] MONGODB_URI is set — skipping local database.");
    // keep process alive so `concurrently` doesn't exit
    setInterval(() => {}, 1 << 30);
    return;
  }
  const dbPath = path.join(process.cwd(), ".data", "db");
  mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ port: 27018, dbPath }],
  });
  await rs.waitUntilRunning();
  console.log(`[db] Local MongoDB replica set ready at ${rs.getUri()} (data in .data/db)`);
  const stop = async () => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[db] failed to start", err);
  process.exit(1);
});
