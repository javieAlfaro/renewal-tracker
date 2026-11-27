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
  let page = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      subscriptions: [{ ...record, id: `page-${++page}` }],
      nextCursor: "same-cursor",
    }),
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

it("rejects duplicate IDs within a page even when the record details differ", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      subscriptions: [record, { ...record, amountMinor: 999 }],
      nextCursor: "another-page",
    }),
  );
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(
    api.list(new AbortController().signal),
    /duplicate subscription records/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

it("rejects duplicates across pages rather than returning double-counted totals", async (t) => {
  let page = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      subscriptions: [record],
      nextCursor: ++page === 1 ? "next-page" : "third-page",
    }),
  );
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(
    api.list(new AbortController().signal),
    /duplicate subscription records/,
  );
  assert.equal(fetch.mock.callCount(), 2);
});

it("accepts identical service names with distinct IDs and resets duplicate tracking for each load", async (t) => {
  const records = [record, { ...record, id: "second-id" }];
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ subscriptions: records, nextCursor: null }),
  );
  const api = subscriptionApi("https://api.example.test", async () => "token");
  assert.deepEqual(await api.list(new AbortController().signal), records);
  assert.deepEqual(await api.list(new AbortController().signal), records);
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

it("skips authentication and network work when the load is already cancelled", async (t) => {
  const controller = new AbortController();
  const reason = new DOMException("Load cancelled", "AbortError");
  controller.abort(reason);
  let tokenCalls = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
  const api = subscriptionApi("https://api.example.test", async () => {
    tokenCalls += 1;
    return "token";
  });
  await assert.rejects(
    api.list(controller.signal),
    (error) => error === reason,
  );
  assert.equal(tokenCalls, 0);
  assert.equal(fetch.mock.callCount(), 0);
});

it("does not send a request if cancellation happens while obtaining a token", async (t) => {
  const controller = new AbortController();
  let releaseToken!: (token: string) => void;
  const token = new Promise<string>((resolve) => {
    releaseToken = resolve;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
  const api = subscriptionApi("https://api.example.test", () => token);
  const result = api.list(controller.signal);
  controller.abort();
  releaseToken("token");
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 0);
});

it("rejects an aborted load after fetch even if the transport returns a response", async (t) => {
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    return Response.json({ subscriptions: [record], nextCursor: "next" });
  });
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(api.list(controller.signal), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});

it("does not return records or request another page after cancellation while reading JSON", async (t) => {
  const controller = new AbortController();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let releaseBody!: (body: unknown) => void;
  const body = new Promise<unknown>((resolve) => {
    releaseBody = resolve;
  });
  const response = Response.json({});
  t.mock.method(response, "json", async () => {
    started();
    return body;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => response);
  const api = subscriptionApi("https://api.example.test", async () => "token");
  const result = api.list(controller.signal);
  await reading;
  controller.abort();
  releaseBody({ subscriptions: [record], nextCursor: "next" });
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});

it("preserves AbortError raised while reading a response body", async (t) => {
  const reason = new DOMException("Read cancelled", "AbortError");
  const response = Response.json({});
  t.mock.method(response, "json", async () => {
    throw reason;
  });
  t.mock.method(globalThis, "fetch", async () => response);
  const api = subscriptionApi("https://api.example.test", async () => "token");
  await assert.rejects(
    api.list(new AbortController().signal),
    (error) => error === reason,
  );
});
