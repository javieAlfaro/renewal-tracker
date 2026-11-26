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
    assert.equal(options.cache, "no-store");
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

it("stops a repeating pagination cursor instead of requesting pages indefinitely", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ subscriptions: [record], nextCursor: "same-cursor" }),
  );
  const api = subscriptionApi(
    "https://api.example.test",
    async () => "test-token",
  );
  await assert.rejects(
    api.list(new AbortController().signal),
    /complete subscription list/,
  );
  assert.equal(fetch.mock.callCount(), 2);
});

it("rejects the entire list when a later page fails", async (t) => {
  let page = 0;
  t.mock.method(globalThis, "fetch", async () => {
    page += 1;
    return page === 1
      ? Response.json({ subscriptions: [record], nextCursor: "next-page" })
      : new Response(null, { status: 500 });
  });
  const api = subscriptionApi(
    "https://api.example.test",
    async () => "test-token",
  );
  await assert.rejects(
    api.list(new AbortController().signal),
    /Could not load subscriptions/,
  );
});

it("reports a missing subscription when an edit returns 404", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  const api = subscriptionApi(
    "https://api.example.test",
    async () => "test-token",
  );
  await assert.rejects(
    api.update("missing-id", details),
    /subscription is unavailable/,
  );
});

it("rejects malformed pages and records before returning a list", async (t) => {
  let body: unknown;
  t.mock.method(globalThis, "fetch", async () => Response.json(body));
  const api = subscriptionApi("https://api.example.test", async () => "token");
  for (body of [
    null,
    [],
    {},
    { subscriptions: [], nextCursor: 12 },
    { subscriptions: [], nextCursor: " " },
    { subscriptions: "invalid", nextCursor: null },
    ...[
      null,
      {},
      { ...record, id: "" },
      { ...record, name: " " },
      { ...record, category: [] },
      { ...record, amountMinor: 1.5 },
      { ...record, amountMinor: -1 },
      { ...record, amountMinor: 10_000_000_000 },
      { ...record, currency: "JPY" },
      { ...record, cycle: "weekly" },
      { ...record, status: "unknown" },
      { ...record, nextChargeDate: "2027-02-29" },
      { ...record, nextChargeDate: "2101-01-01" },
    ].map((subscription) => ({
      subscriptions: [subscription],
      nextCursor: null,
    })),
  ]) {
    await assert.rejects(
      api.list(new AbortController().signal),
      /invalid subscription list/,
    );
  }
});

it("rejects malformed later pages instead of returning a partial list", async (t) => {
  let page = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      ++page === 1
        ? { subscriptions: [record], nextCursor: "next" }
        : {
            subscriptions: [{ ...record, nextChargeDate: "not-a-date" }],
            nextCursor: null,
          },
    ),
  );
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(
    api.list(new AbortController().signal),
    /invalid subscription list/,
  );
  assert.equal(page, 2);
});

it("reports invalid JSON and malformed save responses with recovery guidance", async (t) => {
  let response = new Response("not json", { status: 200 });
  t.mock.method(globalThis, "fetch", async () => response.clone());
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(
    api.list(new AbortController().signal),
    /invalid subscription list/,
  );
  await assert.rejects(
    api.create(details),
    /Reload your list before trying again/,
  );
  for (const body of [
    null,
    {},
    { subscription: { ...record, amountMinor: "12550" } },
  ]) {
    response = Response.json(body);
    await assert.rejects(api.create(details), /invalid save response/);
    await assert.rejects(
      api.update(record.id, details),
      /invalid save response/,
    );
  }
});
