import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  daysBetween,
  monthlyTotal,
  todayInManila,
  upcomingCharges,
  type Subscription,
} from "./subscriptions";

const monthly: Subscription = {
  id: "a",
  name: "Plan",
  category: "Other",
  amountMinor: 12000,
  currency: "PHP",
  cycle: "monthly",
  nextChargeDate: "2026-11-12",
  status: "active",
};

describe("subscription calculations", () => {
  it("normalizes yearly costs and excludes other currencies, trials, and cancelled plans", () => {
    assert.equal(
      monthlyTotal(
        [
          monthly,
          { ...monthly, id: "b", cycle: "yearly" },
          { ...monthly, id: "c", currency: "USD" },
          { ...monthly, id: "d", status: "trial" },
          { ...monthly, id: "e", status: "cancelled" },
        ],
        "PHP",
      ),
      13000,
    );
  });

  it("selects next payments in the next 30 calendar days, including trials and today", () => {
    const records: Subscription[] = [
      { ...monthly, id: "later", nextChargeDate: "2026-12-12" },
      {
        ...monthly,
        id: "trial",
        status: "trial",
        nextChargeDate: "2026-11-13",
      },
      monthly,
      { ...monthly, id: "past", nextChargeDate: "2026-11-11" },
      { ...monthly, id: "cancelled", status: "cancelled" },
      { ...monthly, id: "usd", currency: "USD" },
    ];
    assert.deepEqual(
      upcomingCharges(records, "PHP", "2026-11-12").map((item) => item.id),
      ["a", "trial"],
    );
  });

  it("keeps calendar-day arithmetic correct across leap days and DST changes", () => {
    assert.equal(addDays("2028-02-28", 2), "2028-03-01");
    assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  });

  it("uses Manila calendar dates even when the UTC day differs", () => {
    assert.equal(todayInManila(new Date("2026-11-11T17:00:00Z")), "2026-11-12");
  });
});
