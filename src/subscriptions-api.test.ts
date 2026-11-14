import assert from "node:assert/strict";
import { it } from "node:test";
import { subscriptionApi, type NewSubscription } from "./subscriptions-api";

const details: NewSubscription = {
  name: "Sample Music",
  category: "Entertainment",
  amountMinor: 12550,
  currency: "PHP",
  cycle: "monthly",
  nextChargeDate: "2026-12-01",
  status: "active",
};
const record = { ...details, id: "server-id" };

it("loads all pages using a Cognito access token and an encoded cursor", async (t) => {
  const calls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Bearer test-token",
    );
    calls.push(new URL(url));
    return Response.json(
      calls.length === 1
        ? { subscriptions: [record], nextCursor: "id &+" }
        : { subscriptions: [{ ...record, id: "next-id" }], nextCursor: null },
    );
  });
  const api = subscriptionApi(
    "https://api.example.test/stage",
    async () => "test-token",
  );
  const result = await api.list(new AbortController().signal);
  assert.equal(calls[0].pathname, "/stage/subscriptions");
  assert.equal(calls[1].searchParams.get("after"), "id &+");
  assert.deepEqual(
    result.map(({ id }) => id),
    ["server-id", "next-id"],
  );
});

it("submits only the form fields and uses the ID returned by the API", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.pathname, "/subscriptions");
    assert.equal(options.method, "POST");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-token");
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(String(options.body)), details);
    return Response.json({ subscription: record }, { status: 201 });
  });
  const api = subscriptionApi(
    "https://api.example.test/",
    async () => "test-token",
  );
  assert.deepEqual(await api.create(details), record);
});

it("reports expired sessions without treating the request as a successful save", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 401 }),
  );
  const api = subscriptionApi(
    "https://api.example.test",
    async () => "test-token",
  );
  await assert.rejects(api.create(details), /session has expired/);
});

it("sends edited details and cancellation status to the individual subscription endpoint", async (t) => {
  const edited = {
    ...record,
    amountMinor: 17500,
    status: "cancelled" as const,
  };
  const { id, ...changes } = edited;
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.pathname, "/subscriptions/server-id");
    assert.equal(options.method, "PUT");
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Bearer test-token",
    );
    assert.deepEqual(JSON.parse(String(options.body)), changes);
    return Response.json({ subscription: edited });
  });
  const api = subscriptionApi(
    "https://api.example.test",
    async () => "test-token",
  );
  assert.deepEqual(await api.update(id, changes), edited);
});
