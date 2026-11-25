import type { Subscription, UpcomingCharge } from "./subscriptions";

const header =
  "Name,Category,Amount,Currency,Billing cycle,Next charge date,Status";

function csvDocument(columns: string, rows: readonly string[]): string {
  // The UTF-8 BOM helps spreadsheet apps detect names with non-ASCII characters.
  return `\uFEFF${[columns, ...rows].join("\r\n")}\r\n`;
}

function quoteCell(value: string): string {
  // Keep user-entered names and categories as text in spreadsheet apps.
  const text = /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/.test(value)
    ? `'${value}`
    : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function subscriptionsCsv(records: readonly Subscription[]): string {
  const rows = records.map((record) =>
    [
      quoteCell(record.name),
      quoteCell(record.category),
      (record.amountMinor / 100).toFixed(2),
      record.currency,
      record.cycle,
      record.nextChargeDate,
      record.status,
    ].join(","),
  );
  return csvDocument(header, rows);
}

export function upcomingChargesCsv(charges: readonly UpcomingCharge[]): string {
  return csvDocument(
    "Name,Category,Amount,Currency,Projected charge date,Charge type",
    charges.map(({ subscription, date }) =>
      [
        quoteCell(subscription.name),
        quoteCell(subscription.category),
        (subscription.amountMinor / 100).toFixed(2),
        subscription.currency,
        date,
        subscription.status === "trial" ? "Trial conversion" : "Renewal",
      ].join(","),
    ),
  );
}
