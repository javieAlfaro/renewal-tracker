import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSubscriptions, sortSubscriptions } from "./subscriptions-list";
import type { Subscription } from "./subscriptions";

const records: Subscription[] = [
  {
    id: "spotify",
    name: "Spotify",
    category: "Entertainment",
    amountMinor: 14900,
    currency: "PHP",
    cycle: "monthly",
    nextChargeDate: "2026-11-24",
    status: "active",
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "Entertainment",
    amountMinor: 39900,
    currency: "PHP",
    cycle: "monthly",
    nextChargeDate: "2026-11-27",
    status: "cancelled",
  },
];

describe("subscription search", () => {
  it("filters by original currency together with the other constraints", () => {
    const plans: Subscription[] = [
      ...records,
      { ...records[0], id: "usd", currency: "USD" },
      { ...records[0], id: "eur", currency: "EUR", category: "Storage" },
    ];
    const filters = { status: "all" as const, category: "", search: "" };
    assert.deepEqual(filterSubscriptions(plans, filters), plans);
    assert.deepEqual(
      filterSubscriptions(plans, { ...filters, currency: "" }),
      plans,
    );
    assert.deepEqual(
      filterSubscriptions(plans, { ...filters, currency: "USD" }),
      [plans[2]],
    );
    assert.deepEqual(
      filterSubscriptions(plans, {
        ...filters,
        currency: "PHP",
        status: "active",
        search: "spot",
        category: "Entertainment",
      }),
      [plans[0]],
    );
    assert.deepEqual(
      filterSubscriptions(plans, {
        ...filters,
        currency: "EUR",
        category: "Entertainment",
      }),
      [],
    );
    assert.deepEqual(
      filterSubscriptions([], { ...filters, currency: "PHP" }),
      [],
    );
  });

  it("finds names and categories regardless of case or surrounding whitespace", () => {
    const filters = {
      status: "all" as const,
      category: "",
      search: "  SPOT  ",
    };
    assert.deepEqual(filterSubscriptions(records, filters), [records[0]]);
    assert.deepEqual(
      filterSubscriptions(records, { ...filters, search: " entertainment " }),
      records,
    );
    assert.deepEqual(
      filterSubscriptions(records, { ...filters, search: "   " }),
      records,
    );
  });

  it("combines search with status and category constraints", () => {
    const filters = {
      status: "active" as const,
      category: "Entertainment",
      search: "entertain",
    };
    assert.deepEqual(filterSubscriptions(records, filters), [records[0]]);
    assert.deepEqual(
      filterSubscriptions(records, { ...filters, category: "Storage" }),
      [],
    );
    assert.deepEqual(
      filterSubscriptions(records, { ...filters, search: "missing" }),
      [],
    );
  });
});

describe("subscription sorting", () => {
  it("sorts names naturally without mutating the source or default order", () => {
    const plans = [
      { ...records[0], name: "Plan 10" },
      { ...records[1], name: "plan 2" },
      { ...records[0], id: "alpha", name: "Alpha" },
    ];
    const original = plans.map((plan) => ({ ...plan }));
    assert.deepEqual(
      sortSubscriptions(plans, "name").map((plan) => plan.name),
      ["Alpha", "plan 2", "Plan 10"],
    );
    assert.deepEqual(plans, original);
    assert.deepEqual(sortSubscriptions(plans, "original"), original);
  });

  it("sorts saved dates chronologically and breaks ties by service name", () => {
    const plans = [
      { ...records[0], nextChargeDate: "2027-01-01" },
      { ...records[0], id: "same-date", nextChargeDate: "2026-12-31" },
      { ...records[1], nextChargeDate: "2026-12-31" },
    ];
    assert.deepEqual(
      sortSubscriptions(plans, "billing-date").map((plan) => plan.id),
      ["netflix", "same-date", "spotify"],
    );
    assert.deepEqual(sortSubscriptions([], "billing-date"), []);
  });
});
