import { addDays, nextRenewalDate, todayInManila } from "./subscriptions";
import type {
  BillingCycle,
  Currency,
  Subscription,
  SubscriptionStatus,
} from "./subscriptions";

interface SubscriptionFilters {
  status: "all" | SubscriptionStatus;
  category: string;
  search: string;
  currency?: "" | Currency;
  cycle?: "" | BillingCycle;
  renewalWindow?: RenewalWindow;
}

export type RenewalWindow = "all" | "7" | "30";

export type SubscriptionSort =
  "original" | "name" | "billing-date" | "next-renewal";

export function sortSubscriptions(
  subscriptions: readonly Subscription[],
  sort: SubscriptionSort,
  today = todayInManila(),
): Subscription[] {
  const result = [...subscriptions];
  if (sort === "original") return result;
  const renewals = new Map(
    sort === "next-renewal"
      ? subscriptions.map(
          (item) => [item.id, nextRenewalDate(item, today)] as const,
        )
      : [],
  );
  return result.sort((a, b) => {
    if (sort === "next-renewal") {
      const dateOrder = (renewals.get(a.id) ?? "9999-12-31").localeCompare(
        renewals.get(b.id) ?? "9999-12-31",
      );
      if (dateOrder) return dateOrder;
    }
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
  {
    status,
    category,
    search,
    currency,
    cycle,
    renewalWindow = "all",
  }: SubscriptionFilters,
  today = todayInManila(),
): Subscription[] {
  const query = search.trim().toLowerCase();
  const end =
    renewalWindow === "all" ? null : addDays(today, Number(renewalWindow));
  return subscriptions.filter((item) => {
    const matches =
      (status === "all" || item.status === status) &&
      (!category || item.category === category) &&
      (!currency || item.currency === currency) &&
      (!cycle || item.cycle === cycle) &&
      (item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query));
    if (!matches) return false;
    if (!end) return true;
    const renewal = nextRenewalDate(item, today);
    return renewal !== null && renewal >= today && renewal < end;
  });
}
