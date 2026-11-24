import assert from "node:assert/strict";
import { it } from "node:test";
import { subscriptionsCsv } from "./subscriptions-csv";
import { filterSubscriptions, sortSubscriptions } from "./subscriptions-list";
import type { Subscription } from "./subscriptions";

const plan: Subscription = {
  id: "internal-id",
  name: 'Musiká, "Plus"',
  category: "Entertainment",
  amountMinor: 12550,
  currency: "PHP",
  cycle: "monthly",
  nextChargeDate: "2026-12-01",
  status: "cancelled",
};

const header =
  "\uFEFFName,Category,Amount,Currency,Billing cycle,Next charge date,Status\r\n";

it("exports decimal amounts, Unicode names, and cancelled records without internal IDs", () => {
  assert.equal(
    subscriptionsCsv([plan]),
    header +
      '"Musiká, ""Plus""","Entertainment",125.50,PHP,monthly,2026-12-01,cancelled\r\n',
  );
});

it("quotes multiline text and protects user-entered formula-like cells", () => {
  const csv = subscriptionsCsv([
    { ...plan, name: "  =1+1", category: "first\nsecond" },
    { ...plan, name: "\tplain", category: "@SUM(1,2)" },
  ]);
  assert.ok(csv.includes('"\'  =1+1","first\nsecond"'));
  assert.ok(csv.includes('"\'\tplain","\'@SUM(1,2)"'));
  assert.equal(subscriptionsCsv([]), header);
});

it("exports filtered records in display order while preserving the full export", () => {
  const records: Subscription[] = [
    { ...plan, id: "z", name: "Zeta", status: "active" },
    { ...plan, id: "a", name: "Alpha", status: "active" },
    { ...plan, id: "usd", name: "USD plan", currency: "USD", status: "active" },
    { ...plan, id: "annual", cycle: "yearly", status: "active" },
    plan,
  ];
  const originalCsv = subscriptionsCsv(records);
  const visible = sortSubscriptions(
    filterSubscriptions(records, {
      status: "active",
      category: "Entertainment",
      search: "a",
      currency: "PHP",
      cycle: "monthly",
    }),
    "name",
  );
  const csv = subscriptionsCsv(visible);
  assert.deepEqual(
    visible.map((record) => record.id),
    ["a", "z"],
  );
  assert.equal(csv, subscriptionsCsv([records[1], records[0]]));
  assert.ok(!csv.includes("USD plan"));
  assert.ok(!csv.includes("cancelled"));
  assert.equal(subscriptionsCsv(records), originalCsv);
  assert.equal(records[0].id, "z");
});
