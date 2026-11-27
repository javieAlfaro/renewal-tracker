import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import {
  millisecondsUntilManilaMidnight,
  watchManilaDate,
} from "./manila-clock";
import { createDemoSubscriptions, upcomingCharges } from "./subscriptions";

function fakeClock(t: TestContext, start: string) {
  let now = Date.parse(start);
  const timers = new Map<
    ReturnType<typeof setTimeout>,
    { callback: () => void; delay: number }
  >();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setTimeout", ((
    callback: () => void,
    delay: number,
  ) => {
    const handle = {} as ReturnType<typeof setTimeout>;
    timers.set(handle, { callback, delay });
    return handle;
  }) as typeof setTimeout);
  t.mock.method(globalThis, "clearTimeout", ((
    handle: ReturnType<typeof setTimeout>,
  ) => {
    timers.delete(handle);
  }) as typeof clearTimeout);
  return {
    timers,
    setNow: (value: string) => {
      now = Date.parse(value);
    },
  };
}

it("schedules the next Manila midnight across leap days and year boundaries", () => {
  for (const [now, expected] of [
    ["2026-11-27T15:59:59.999Z", 1],
    ["2026-11-27T16:00:00Z", 86_400_000],
    ["2028-02-28T15:00:00Z", 3_600_000],
    ["2028-02-29T15:00:00Z", 3_600_000],
    ["2026-12-31T15:59:00Z", 60_000],
  ] as const)
    assert.equal(millisecondsUntilManilaMidnight(Date.parse(now)), expected);
});

it("refreshes the forecast at midnight without recreating saved subscriptions", (t) => {
  const clock = fakeClock(t, "2026-11-27T15:59:59Z");
  const records = createDemoSubscriptions("2026-11-27");
  records.push({
    ...records[0],
    id: "trial-today",
    status: "trial",
    nextChargeDate: "2026-11-27",
  });
  const original = structuredClone(records);
  const dates: string[] = [];
  const stop = watchManilaDate((date) => dates.push(date), new EventTarget());
  const tick = [...clock.timers.values()][0];
  assert.equal(tick.delay, 1000);
  clock.setNow("2026-11-27T16:00:00Z");
  tick.callback();
  assert.deepEqual(dates, ["2026-11-27", "2026-11-28"]);
  assert.equal(clock.timers.size, 1);
  assert.equal([...clock.timers.values()][0].delay, 86_400_000);
  assert.ok(
    upcomingCharges(records, "PHP", dates[0]).some(
      ({ subscription }) => subscription.id === "trial-today",
    ),
  );
  assert.ok(
    !upcomingCharges(records, "PHP", dates[1]).some(
      ({ subscription }) => subscription.id === "trial-today",
    ),
  );
  assert.equal(upcomingCharges(records, "PHP", dates[1])[0].date, "2026-11-29");
  assert.deepEqual(records, original);
  stop();
  assert.equal(clock.timers.size, 0);
});

it("catches up after a suspended tab resumes and cleans up timers and listeners", (t) => {
  const clock = fakeClock(t, "2026-11-27T10:00:00Z");
  const target = new EventTarget();
  const dates: string[] = [];
  const stop = watchManilaDate((date) => dates.push(date), target);
  const staleTick = [...clock.timers.values()][0].callback;
  clock.setNow("2026-11-29T02:00:00Z");
  target.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(dates, ["2026-11-27", "2026-11-29"]);
  assert.equal(clock.timers.size, 1);
  assert.equal([...clock.timers.values()][0].delay, 14 * 3_600_000);
  stop();
  stop();
  target.dispatchEvent(new Event("visibilitychange"));
  staleTick();
  assert.equal(clock.timers.size, 0);
  assert.equal(dates.length, 2);
});
