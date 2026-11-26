import { currencies, type Subscription } from "./subscriptions";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSubscription(value: unknown): value is Subscription {
  if (!isObject(value)) return false;
  const {
    id,
    name,
    category,
    amountMinor,
    currency,
    cycle,
    nextChargeDate,
    status,
  } = value;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 80 ||
    typeof category !== "string" ||
    !category.trim() ||
    category.trim().length > 40 ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > 9_999_999_900 ||
    !currencies.some((supported) => supported === currency) ||
    (cycle !== "monthly" && cycle !== "yearly") ||
    (status !== "active" && status !== "trial" && status !== "cancelled") ||
    typeof nextChargeDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate) ||
    nextChargeDate < "2000-01-01" ||
    nextChargeDate > "2100-12-31"
  )
    return false;
  const date = new Date(`${nextChargeDate}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === nextChargeDate
  );
}

async function readJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(message);
  }
}

export type SubscriptionDetails = Omit<Subscription, "id">;
export type NewSubscription = SubscriptionDetails & {
  status: "active" | "trial";
};

export function subscriptionApi(
  baseUrl: string,
  accessToken: () => Promise<string>,
) {
  const endpoint = new URL("subscriptions", `${baseUrl.replace(/\/+$/, "")}/`);

  async function request(url: URL, options: RequestInit, message: string) {
    options.signal?.throwIfAborted();
    const headers = new Headers(options.headers);
    const token = await accessToken();
    options.signal?.throwIfAborted();
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: "error",
      cache: "no-store",
    });
    options.signal?.throwIfAborted();
    if (response.status === 401) {
      throw new Error("Your session has expired. Sign out and sign in again.");
    }
    if (options.method === "PUT" && response.status === 404) {
      throw new Error(
        "This subscription is unavailable. Reload your list and try again.",
      );
    }
    if (!response.ok) throw new Error(message);
    return response;
  }

  async function save(
    url: URL,
    method: "POST" | "PUT",
    details: SubscriptionDetails,
  ): Promise<Subscription> {
    const response = await request(
      url,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      },
      "Could not save the subscription. Check your details and try again.",
    );
    const message =
      "The service returned an invalid save response. Reload your list before trying again.";
    const result = await readJson(response, message);
    if (!isObject(result) || !isSubscription(result.subscription))
      throw new Error(message);
    return result.subscription;
  }

  return {
    async list(signal: AbortSignal): Promise<Subscription[]> {
      const subscriptions: Subscription[] = [];
      const url = new URL(endpoint);
      const seen = new Set<string>();
      do {
        const response = await request(
          url,
          { signal },
          "Could not load subscriptions. Try again.",
        );
        const message =
          "The service returned an invalid subscription list. Reload and try again.";
        const page = await readJson(response, message);
        signal.throwIfAborted();
        if (
          !isObject(page) ||
          !Array.isArray(page.subscriptions) ||
          !page.subscriptions.every(isSubscription) ||
          !(
            page.nextCursor === null ||
            (typeof page.nextCursor === "string" &&
              page.nextCursor.trim().length > 0)
          )
        )
          throw new Error(message);
        subscriptions.push(...page.subscriptions);
        if (!page.nextCursor) return subscriptions;
        if (seen.has(page.nextCursor))
          throw new Error("Could not load the complete subscription list.");
        seen.add(page.nextCursor);
        url.searchParams.set("after", page.nextCursor);
      } while (true);
    },

    create(details: NewSubscription) {
      return save(endpoint, "POST", details);
    },

    update(id: string, details: SubscriptionDetails) {
      return save(
        new URL(`${endpoint.href}/${encodeURIComponent(id)}`),
        "PUT",
        details,
      );
    },
  };
}
