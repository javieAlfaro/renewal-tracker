import type { Subscription } from "./subscriptions";

export type NewSubscription = Omit<Subscription, "id" | "status"> & {
  status: "active" | "trial";
};

export function subscriptionApi(
  baseUrl: string,
  accessToken: () => Promise<string>,
) {
  const endpoint = new URL("subscriptions", `${baseUrl.replace(/\/+$/, "")}/`);

  async function request(url: URL, options: RequestInit, message: string) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${await accessToken()}`);
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: "error",
    });
    if (response.status === 401) {
      throw new Error("Your session has expired. Sign out and sign in again.");
    }
    if (!response.ok) throw new Error(message);
    return response;
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
        const page: {
          subscriptions: Subscription[];
          nextCursor: string | null;
        } = await response.json();
        subscriptions.push(...page.subscriptions);
        if (!page.nextCursor) return subscriptions;
        if (seen.has(page.nextCursor))
          throw new Error("Could not load the complete subscription list.");
        seen.add(page.nextCursor);
        url.searchParams.set("after", page.nextCursor);
      } while (true);
    },

    async create(details: NewSubscription): Promise<Subscription> {
      const response = await request(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        },
        "Could not save the subscription. Check your details and try again.",
      );
      const result: { subscription: Subscription } = await response.json();
      return result.subscription;
    },
  };
}
