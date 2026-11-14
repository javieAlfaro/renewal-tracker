import type { Subscription } from "./subscriptions";

const header =
  "Name,Category,Amount,Currency,Billing cycle,Next charge date,Status";

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
  // The UTF-8 BOM helps spreadsheet apps detect names with non-ASCII characters.
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
