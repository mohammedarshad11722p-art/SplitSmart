// Location: backend/tests/keyedLock.test.ts
import { KeyedLock } from "../src/utils/keyedLock";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("KeyedLock", () => {
  it("runs tasks for the same key one after another, in order", async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    await Promise.all([
      lock.run("room1", async () => { log.push("a start"); await wait(30); log.push("a end"); }),
      lock.run("room1", async () => { log.push("b start"); await wait(5); log.push("b end"); }),
    ]);
    expect(log).toEqual(["a start", "a end", "b start", "b end"]); // b waited for a
  });

  it("lets different keys run in parallel", async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    await Promise.all([
      lock.run("room1", async () => { log.push("1 start"); await wait(30); log.push("1 end"); }),
      lock.run("room2", async () => { log.push("2 start"); await wait(5); log.push("2 end"); }),
    ]);
    expect(log.indexOf("2 end")).toBeLessThan(log.indexOf("1 end")); // room2 didn't wait
  });

  it("keeps going after a task fails, and passes the error to its caller", async () => {
    const lock = new KeyedLock();
    const failing = lock.run("room1", async () => { throw new Error("boom"); });
    const next = lock.run("room1", async () => "still works");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("still works");
  });

  it("cleans up keys when idle", async () => {
    const lock = new KeyedLock();
    await lock.run("room1", async () => 1);
    await wait(0);
    expect(lock.size).toBe(0);
  });
});
