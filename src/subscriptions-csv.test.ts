import assert from "node:assert/strict";
import { it } from "node:test";
import { subscriptionsCsv, upcomingChargesCsv } from "./subscriptions-csv";
import { filterSubscriptions, sortSubscriptions } from "./subscriptions-list";
import { upcomingCharges, type Subscription } from "./subscriptions";

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

const forecastHeader =
  "\uFEFFName,Category,Amount,Currency,Projected charge date,Charge type\r\n";

it("exports every projected charge in chronological order, including repeated monthly charges and trial conversions", () => {
  const records: Subscription[] = [
    {
      ...plan,
      name: "Monthly",
      status: "active",
      nextChargeDate: "2027-02-01",
    },
    {
      ...plan,
      id: "trial",
      name: "Trial",
      status: "trial",
      nextChargeDate: "2027-02-02",
    },
    {
      ...plan,
      id: "annual",
      name: "Annual",
      cycle: "yearly",
      status: "active",
      nextChargeDate: "2024-02-29",
    },
    {
      ...plan,
      id: "usd",
      status: "active",
      currency: "USD",
      nextChargeDate: "2027-02-01",
    },
    { ...plan, id: "expired", status: "trial", nextChargeDate: "2027-01-31" },
    { ...plan, id: "outside", status: "trial", nextChargeDate: "2027-03-03" },
    plan,
  ];
  const original = structuredClone(records);
  const csv = upcomingChargesCsv(upcomingCharges(records, "PHP", "2027-02-01"));
  assert.equal(
    csv,
    forecastHeader +
      '"Monthly","Entertainment",125.50,PHP,2027-02-01,Renewal\r\n' +
      '"Trial","Entertainment",125.50,PHP,2027-02-02,Trial conversion\r\n' +
      '"Annual","Entertainment",125.50,PHP,2027-02-28,Renewal\r\n' +
      '"Monthly","Entertainment",125.50,PHP,2027-03-01,Renewal\r\n',
  );
  assert.deepEqual(records, original);
});

it("escapes forecast text, preserves Unicode, and exports a header for an empty forecast", () => {
  assert.equal(upcomingChargesCsv([]), forecastHeader);
  assert.equal(
    upcomingChargesCsv([
      {
        subscription: {
          ...plan,
          name: "=SUM(1,2)",
          category: 'Musiká "Plus"\nTeam',
          status: "active",
          currency: "EUR",
        },
        date: "2027-02-28",
      },
    ]),
    forecastHeader +
      '"\'=SUM(1,2)","Musiká ""Plus""\nTeam",125.50,EUR,2027-02-28,Renewal\r\n',
  );
});
