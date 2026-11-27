import assert from "node:assert/strict";
import { it } from "node:test";
import { createSessionInitializer } from "./session-initializer";

it("shares an in-flight attempt and caches the successful session", async () => {
  let calls = 0;
  let release!: (session: { id: string }) => void;
  const pending = new Promise<{ id: string }>((resolve) => {
    release = resolve;
  });
  const initialize = createSessionInitializer(() => {
    calls += 1;
    return pending;
  });
  const first = initialize();
  assert.equal(initialize(), first);
  const session = { id: "signed-in-user" };
  release(session);
  assert.equal(await first, session);
  assert.equal(initialize(), first);
  assert.equal(await initialize(), session);
  assert.equal(calls, 1);
});

it("caches a successful signed-out result", async () => {
  let calls = 0;
  const initialize = createSessionInitializer(async () => {
    calls += 1;
    return null;
  });
  assert.equal(await initialize(), null);
  assert.equal(await initialize(), null);
  assert.equal(calls, 1);
});

it("retries a rejected initialization and shares the replacement attempt", async () => {
  let calls = 0;
  const failure = new Error("Temporary storage failure");
  const session = { id: "recovered-user" };
  const initialize = createSessionInitializer(async () => {
    if (++calls === 1) throw failure;
    return session;
  });
  const failed = initialize();
  assert.equal(initialize(), failed);
  await assert.rejects(failed, (error) => error === failure);
  const retried = initialize();
  assert.notEqual(retried, failed);
  assert.equal(initialize(), retried);
  assert.equal(await retried, session);
  assert.equal(await initialize(), session);
  assert.equal(calls, 2);
});

it("allows another retry after repeated failures without starting retries automatically", async () => {
  let calls = 0;
  const initialize = createSessionInitializer(async () => {
    if (++calls < 3) throw new Error(`Failure ${calls}`);
    return null;
  });
  await assert.rejects(initialize(), /Failure 1/);
  assert.equal(calls, 1);
  await assert.rejects(initialize(), /Failure 2/);
  assert.equal(calls, 2);
  assert.equal(await initialize(), null);
  assert.equal(await initialize(), null);
  assert.equal(calls, 3);
});

it("turns a synchronous initialization failure into a retryable rejection", async () => {
  let calls = 0;
  const initialize = createSessionInitializer(() => {
    if (++calls === 1) throw new Error("Initialization failed immediately");
    return Promise.resolve("ready");
  });
  await assert.rejects(initialize(), /failed immediately/);
  assert.equal(await initialize(), "ready");
  assert.equal(calls, 2);
});
