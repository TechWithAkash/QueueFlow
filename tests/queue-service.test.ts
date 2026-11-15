/**
 * Integration tests against a real (in-memory) MongoDB replica set.
 * These cover the parts that only break under concurrency or across days.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Queue } from "@/lib/models";
import { addToken, callNext, createQueue, getSnapshot, moveToken, tokenAction } from "@/lib/queue-service";

let repl: MongoMemoryReplSet;
const owner = new Types.ObjectId().toString();
let queueId: string;

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = repl.getUri();
  await mongoose.connect(repl.getUri());
  await mongoose.connection.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await mongoose.connection.syncIndexes();
  queueId = (await createQueue(owner, { name: "General OPD", prefix: "A", counters: 3 })).id;
});

const codes = async () => (await getSnapshot(owner, queueId)).waiting.map((t) => t.code);

describe("issuing tokens", () => {
  it("numbers tokens A-001, A-002, …", async () => {
    await addToken(owner, queueId, { name: "Asha" });
    await addToken(owner, queueId, { name: "Bilal" });
    expect(await codes()).toEqual(["A-001", "A-002"]);
  });

  it("never hands out the same number twice, even when added at the same moment", async () => {
    const issued = await Promise.all(Array.from({ length: 25 }, (_, i) => addToken(owner, queueId, { name: `P${i}` })));
    const numbers = issued.map((t) => t.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(25);
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("restarts numbering on a new day", async () => {
    await addToken(owner, queueId, { name: "Yesterday" });
    await Queue.updateOne({ _id: queueId }, { $set: { numberDay: "2000-01-01" } });
    const t = await addToken(owner, queueId, { name: "Today" });
    expect(t.code).toBe("A-001");
  });

  it("puts priority tokens ahead of normal ones, in arrival order", async () => {
    await addToken(owner, queueId, { name: "n1" });
    await addToken(owner, queueId, { name: "n2" });
    await addToken(owner, queueId, { name: "p1", priority: true });
    await addToken(owner, queueId, { name: "p2", priority: true });
    expect(await codes()).toEqual(["A-003", "A-004", "A-001", "A-002"]);
  });
});

describe("reordering", () => {
  it("moves a token up and down", async () => {
    for (const n of ["a", "b", "c"]) await addToken(owner, queueId, { name: n });
    const [, b] = (await getSnapshot(owner, queueId)).waiting;
    await moveToken(owner, b.id, { direction: "up" });
    expect(await codes()).toEqual(["A-002", "A-001", "A-003"]);
    await moveToken(owner, b.id, { direction: "down" });
    await moveToken(owner, b.id, { direction: "down" });
    expect(await codes()).toEqual(["A-001", "A-003", "A-002"]);
  });

  it("drops a token before another one (drag and drop)", async () => {
    for (const n of ["a", "b", "c", "d"]) await addToken(owner, queueId, { name: n });
    const [a, , , d] = (await getSnapshot(owner, queueId)).waiting;
    await moveToken(owner, d.id, { beforeId: a.id });
    expect(await codes()).toEqual(["A-004", "A-001", "A-002", "A-003"]);
  });

  it("survives many moves into the same gap (rebalancing)", async () => {
    for (const n of ["a", "b", "c"]) await addToken(owner, queueId, { name: n });
    const [a, b, c] = (await getSnapshot(owner, queueId)).waiting;
    // Alternate b and c into the gap right after a, 80 times. Without rebalancing the
    // midpoints would run out of floating-point precision.
    for (let i = 0; i < 80; i++) {
      const mover = i % 2 ? b : c;
      const snap = (await getSnapshot(owner, queueId)).waiting;
      await moveToken(owner, mover.id, { beforeId: snap[1].id === mover.id ? snap[2].id : snap[1].id });
    }
    const final = await codes();
    expect(final[0]).toBe(a.code);
    expect(new Set(final).size).toBe(3);
  });
});

describe("serving", () => {
  it("calls the top token and finishes the previous one at that counter", async () => {
    await addToken(owner, queueId, { name: "a" });
    await addToken(owner, queueId, { name: "b" });
    expect((await callNext(owner, queueId, 1))?.code).toBe("A-001");
    expect((await callNext(owner, queueId, 1))?.code).toBe("A-002");
    const snap = await getSnapshot(owner, queueId);
    expect(snap.serving.map((t) => t.code)).toEqual(["A-002"]);
    expect(snap.recent.find((t) => t.code === "A-001")?.status).toBe("served");
  });

  it("never gives the same token to two counters calling at once", async () => {
    for (let i = 0; i < 3; i++) await addToken(owner, queueId, { name: `p${i}` });
    const called = await Promise.all([1, 2, 3].map((c) => callNext(owner, queueId, c)));
    expect(new Set(called.map((t) => t?.code)).size).toBe(3);
  });

  it("returns null when nobody is waiting", async () => {
    expect(await callNext(owner, queueId, 1)).toBeNull();
  });

  it("rejects a counter that doesn't exist", async () => {
    await expect(callNext(owner, queueId, 9)).rejects.toThrow(/Counter 9/);
  });
});

describe("cancel and undo", () => {
  it("puts a cancelled token back in its old place", async () => {
    for (const n of ["a", "b", "c"]) await addToken(owner, queueId, { name: n });
    const [, b] = (await getSnapshot(owner, queueId)).waiting;
    await tokenAction(owner, b.id, "cancel");
    expect(await codes()).toEqual(["A-001", "A-003"]);
    await tokenAction(owner, b.id, "restore");
    expect(await codes()).toEqual(["A-001", "A-002", "A-003"]);
  });

  it("refuses to cancel a token that is already being served", async () => {
    const t = await addToken(owner, queueId, { name: "a" });
    await callNext(owner, queueId, 1);
    await expect(tokenAction(owner, t.id, "cancel")).rejects.toThrow(/being served/);
  });

  it("hides other managers' queues", async () => {
    const stranger = new Types.ObjectId().toString();
    await expect(getSnapshot(stranger, queueId)).rejects.toThrow(/not found/);
  });
});
