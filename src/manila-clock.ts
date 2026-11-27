import { addDays, todayInManila } from "./subscriptions";

export function millisecondsUntilManilaMidnight(now: number): number {
  const tomorrow = addDays(todayInManila(new Date(now)), 1);
  return Date.parse(`${tomorrow}T00:00:00+08:00`) - now;
}

export function watchManilaDate(
  onChange: (date: string) => void,
  resumeTarget: EventTarget = document,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;

  function refresh() {
    if (!active) return;
    if (timer !== undefined) clearTimeout(timer);
    const now = Date.now();
    onChange(todayInManila(new Date(now)));
    timer = setTimeout(refresh, millisecondsUntilManilaMidnight(now));
  }

  resumeTarget.addEventListener("visibilitychange", refresh);
  refresh();
  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    resumeTarget.removeEventListener("visibilitychange", refresh);
  };
}
