import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSubscriptions } from "./subscriptions-list";
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
