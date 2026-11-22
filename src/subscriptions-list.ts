import type { Subscription, SubscriptionStatus } from "./subscriptions";

interface SubscriptionFilters {
  status: "all" | SubscriptionStatus;
  category: string;
  search: string;
}

export type SubscriptionSort = "original" | "name" | "billing-date";

export function sortSubscriptions(
  subscriptions: readonly Subscription[],
  sort: SubscriptionSort,
): Subscription[] {
  const result = [...subscriptions];
  if (sort === "original") return result;
  return result.sort((a, b) => {
    if (sort === "billing-date") {
      const dateOrder = a.nextChargeDate.localeCompare(b.nextChargeDate);
      if (dateOrder) return dateOrder;
    }
    return a.name.localeCompare(b.name, "en", {
      sensitivity: "base",
      numeric: true,
    });
  });
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
