"use client";

/** Lightweight marks for physical WebView profiling. They are no-ops where the
 * Performance API is unavailable and do not send user data or network calls. */
export function markPerformance(name: string) {
  if (typeof window === "undefined" || !window.performance?.mark) return;
  const markName = `joe-yoke:${name}`;
  window.performance.mark(markName);
  if (process.env.NEXT_PUBLIC_PERF_DEBUG === "true") {
    const entry = window.performance.getEntriesByName(markName).at(-1);
    console.info(`[performance] ${markName}`, Math.round(entry?.startTime ?? 0));
  }
}
