import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSubscriptions, sortSubscriptions } from "./subscriptions-list";
import { nextRenewalDate, type Subscription } from "./subscriptions";

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
  it("combines billing cycle with currency, status, category, and search", () => {
    const plans: Subscription[] = [
      ...records,
      { ...records[0], id: "annual", cycle: "yearly" },
      { ...records[0], id: "annual-usd", cycle: "yearly", currency: "USD" },
    ];
    const filters = { status: "all" as const, category: "", search: "" };
    assert.deepEqual(
      filterSubscriptions(plans, { ...filters, cycle: "" }),
      plans,
    );
    assert.deepEqual(
      filterSubscriptions(plans, { ...filters, cycle: "monthly" }),
      records,
    );
    assert.deepEqual(
      filterSubscriptions(plans, {
        ...filters,
        cycle: "yearly",
        currency: "PHP",
        status: "active",
        category: "Entertainment",
        search: "spot",
      }),
      [plans[2]],
    );
    assert.deepEqual(
      filterSubscriptions(plans, {
        ...filters,
        cycle: "yearly",
        status: "cancelled",
      }),
      [],
    );
    assert.deepEqual(
      plans.map((plan) => plan.id),
      ["spotify", "netflix", "annual", "annual-usd"],
    );
  });

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
  it("projects renewals past old anchors and puts unscheduled records last", () => {
    const plans: Subscription[] = [
      { ...records[0], id: "old", nextChargeDate: "2025-01-31" },
      {
        ...records[0],
        id: "yearly",
        cycle: "yearly",
        nextChargeDate: "2024-02-29",
      },
      { ...records[0], id: "future", nextChargeDate: "2026-03-02" },
      {
        ...records[0],
        id: "trial",
        status: "trial",
        nextChargeDate: "2026-02-28",
      },
      {
        ...records[0],
        id: "expired",
        name: "Expired",
        status: "trial",
        nextChargeDate: "2026-02-01",
      },
      { ...records[1], id: "cancelled" },
    ];
    assert.equal(nextRenewalDate(plans[0], "2026-02-28"), "2026-02-28");
    assert.equal(nextRenewalDate(plans[0], "2026-03-01"), "2026-03-31");
    assert.equal(nextRenewalDate(plans[1], "2026-03-01"), "2027-02-28");
    assert.equal(nextRenewalDate(plans[1], "2028-02-01"), "2028-02-29");
    assert.equal(nextRenewalDate(plans[2], "2026-02-28"), "2026-03-02");
    assert.equal(nextRenewalDate(plans[4], "2026-02-28"), null);
    assert.equal(nextRenewalDate(plans[5], "2026-02-28"), null);
    assert.deepEqual(
      sortSubscriptions(plans, "next-renewal", "2026-02-28").map(
        (plan) => plan.id,
      ),
      ["old", "yearly", "trial", "future", "expired", "cancelled"],
    );
    assert.equal(plans[0].nextChargeDate, "2025-01-31");
  });

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
