import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  daysBetween,
  monthlyTotal,
  annualTotal,
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
  it("estimates annual spending from original amounts without rounding monthly equivalents", () => {
    assert.equal(
      annualTotal(
        [
          { ...monthly, amountMinor: 101 },
          { ...monthly, amountMinor: 10001, cycle: "yearly" },
          { ...monthly, currency: "USD" },
          { ...monthly, status: "trial" },
          { ...monthly, status: "cancelled" },
        ],
        "PHP",
      ),
      11213,
    );
    assert.equal(annualTotal([], "PHP"), 0);
  });
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
      upcomingCharges(records, "PHP", "2026-11-12").map(
        ({ subscription }) => subscription.id,
      ),
      ["a", "trial", "past"],
    );
  });

  it("forecasts short months and restores the original billing day in later months", () => {
    const plan = { ...monthly, nextChargeDate: "2027-01-31" };
    assert.deepEqual(
      upcomingCharges([plan], "PHP", "2027-02-01").map(({ date }) => date),
      ["2027-02-28"],
    );
    assert.deepEqual(
      upcomingCharges([plan], "PHP", "2027-02-28").map(({ date }) => date),
      ["2027-02-28"],
    );
    assert.deepEqual(
      upcomingCharges([plan], "PHP", "2027-03-02").map(({ date }) => date),
      ["2027-03-31"],
    );
  });

  it("counts both monthly charges when they fit inside the 30-day window", () => {
    const plan = { ...monthly, nextChargeDate: "2027-02-01" };
    assert.deepEqual(
      upcomingCharges([plan], "PHP", "2027-02-01").map(({ date }) => date),
      ["2027-02-01", "2027-03-01"],
    );
  });

  it("projects yearly leap-day billing and leaves expired trials out of the forecast", () => {
    const annual = {
      ...monthly,
      cycle: "yearly" as const,
      nextChargeDate: "2024-02-29",
    };
    const expiredTrial = {
      ...monthly,
      status: "trial" as const,
      nextChargeDate: "2027-01-01",
    };
    assert.deepEqual(
      upcomingCharges([annual, expiredTrial], "PHP", "2027-02-28").map(
        ({ date }) => date,
      ),
      ["2027-02-28"],
    );
    assert.deepEqual(
      upcomingCharges([annual], "PHP", "2028-02-29").map(({ date }) => date),
      ["2028-02-29"],
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
