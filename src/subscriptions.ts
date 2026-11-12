export const currencies = ["PHP", "USD", "EUR"] as const;
export type Currency = (typeof currencies)[number];
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "trial" | "cancelled";

export interface Subscription {
  id: string;
  name: string;
  category: string;
  amountMinor: number;
  currency: Currency;
  cycle: BillingCycle;
  nextChargeDate: string;
  status: SubscriptionStatus;
}

// Calendar dates stay date-only. UTC is used only for arithmetic to avoid DST shifts.
export function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );
}

const manilaDate = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInManila(now = new Date()): string {
  const parts = Object.fromEntries(
    manilaDate.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatMoney(amountMinor: number, currency: Currency): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  }).format(amountMinor / 100);
}

export function monthlyTotal(
  subscriptions: Subscription[],
  currency: Currency,
): number {
  const total = subscriptions
    .filter((item) => item.currency === currency && item.status === "active")
    .reduce(
      (sum, item) =>
        sum + item.amountMinor / (item.cycle === "yearly" ? 12 : 1),
      0,
    );
  return Math.round(total);
}

export function upcomingCharges(
  subscriptions: Subscription[],
  currency: Currency,
  today: string,
): Subscription[] {
  return subscriptions
    .filter((item) => {
      const days = daysBetween(today, item.nextChargeDate);
      return (
        item.currency === currency &&
        item.status !== "cancelled" &&
        days >= 0 &&
        days < 30
      );
    })
    .sort((a, b) => a.nextChargeDate.localeCompare(b.nextChargeDate));
}

export function createDemoSubscriptions(today: string): Subscription[] {
  return [
    {
      id: "spotify",
      name: "Spotify",
      category: "Entertainment",
      amountMinor: 14900,
      currency: "PHP",
      cycle: "monthly",
      nextChargeDate: addDays(today, 2),
      status: "active",
    },
    {
      id: "netflix",
      name: "Netflix",
      category: "Entertainment",
      amountMinor: 39900,
      currency: "PHP",
      cycle: "monthly",
      nextChargeDate: addDays(today, 5),
      status: "active",
    },
    {
      id: "notion",
      name: "Notion",
      category: "Productivity",
      amountMinor: 600000,
      currency: "PHP",
      cycle: "yearly",
      nextChargeDate: addDays(today, 40),
      status: "active",
    },
    {
      id: "canva",
      name: "Canva",
      category: "Design",
      amountMinor: 30000,
      currency: "PHP",
      cycle: "monthly",
      nextChargeDate: addDays(today, 8),
      status: "trial",
    },
    {
      id: "icloud",
      name: "iCloud+",
      category: "Storage",
      amountMinor: 4900,
      currency: "PHP",
      cycle: "monthly",
      nextChargeDate: addDays(today, 16),
      status: "active",
    },
    {
      id: "github",
      name: "GitHub",
      category: "Development",
      amountMinor: 400,
      currency: "USD",
      cycle: "monthly",
      nextChargeDate: addDays(today, 12),
      status: "active",
    },
  ];
}
