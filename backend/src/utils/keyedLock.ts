// Location: backend/src/utils/keyedLock.ts
// Runs async tasks one at a time PER KEY (we use the room id as the key).
//
// Why: if Priya and Rahul tap the same item at the same instant, both
// requests read → write → read the claim list. Interleaved, the two
// broadcasts could arrive out of order and a phone would show a stale list.
// Queuing changes per room makes every broadcast reflect the latest state.
// Different rooms never wait for each other.
//
// Note: this lock lives in memory, so it only works with ONE server process.
// That's what we run on Render. Scaling to several servers would need a
// shared lock (e.g. Redis) and the Socket.io Redis adapter.
export class KeyedLock {
  private tails = new Map<string, Promise<void>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // Start after the previous task for this key has settled.
    const result = previous.then(() => task());
    // The queue continues even if this task throws.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    // Clean up so the map doesn't grow forever.
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** For tests: how many keys currently have queued work. */
  get size() {
    return this.tails.size;
  }
}
