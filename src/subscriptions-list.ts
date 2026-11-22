import type { Subscription, SubscriptionStatus } from "./subscriptions";

interface SubscriptionFilters {
  status: "all" | SubscriptionStatus;
  category: string;
  search: string;
}

export function filterSubscriptions(
  subscriptions: readonly Subscription[],
  { status, category, search }: SubscriptionFilters,
): Subscription[] {
  const query = search.trim().toLowerCase();
  return subscriptions.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      (!category || item.category === category) &&
      (item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)),
  );
}
