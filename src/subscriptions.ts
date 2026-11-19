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

export function annualTotal(
  subscriptions: Subscription[],
  currency: Currency,
): number {
  return subscriptions
    .filter((item) => item.currency === currency && item.status === "active")
    .reduce(
      (sum, item) =>
        sum + item.amountMinor * (item.cycle === "monthly" ? 12 : 1),
      0,
    );
}

function billingDate(anchor: Date, monthsAfterAnchor: number): string {
  const month = anchor.getUTCMonth() + monthsAfterAnchor;
  const year = anchor.getUTCFullYear();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchor.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

interface UpcomingCharge {
  subscription: Subscription;
  date: string;
}

export function upcomingCharges(
  subscriptions: Subscription[],
  currency: Currency,
  today: string,
): UpcomingCharge[] {
  const charges: UpcomingCharge[] = [];
  const end = addDays(today, 30);
  const current = new Date(`${today}T00:00:00Z`);

  for (const subscription of subscriptions) {
    if (
      subscription.currency !== currency ||
      subscription.status === "cancelled"
    )
      continue;
    const start = subscription.nextChargeDate;
    if (start >= end) continue;

    if (subscription.status === "trial") {
      if (start >= today) charges.push({ subscription, date: start });
      continue;
    }

    const anchor = new Date(`${start}T00:00:00Z`);
    const cycleMonths = subscription.cycle === "monthly" ? 1 : 12;
    const monthsElapsed =
      (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      current.getUTCMonth() -
      anchor.getUTCMonth();
    // Skip completed cycles while keeping each projected date tied to the original day.
    let offset = Math.max(
      0,
      Math.floor(monthsElapsed / cycleMonths) * cycleMonths,
    );
    for (
      let date = billingDate(anchor, offset);
      date < end;
      date = billingDate(anchor, offset)
    ) {
      if (date >= today) charges.push({ subscription, date });
      offset += cycleMonths;
    }
  }

  return charges.sort((a, b) => a.date.localeCompare(b.date));
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
