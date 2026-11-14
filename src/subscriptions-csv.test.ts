import assert from "node:assert/strict";
import { it } from "node:test";
import { subscriptionsCsv } from "./subscriptions-csv";
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
