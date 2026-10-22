import type { Scorer } from "../types";

const TOL = 45 * 60_000;

// Of the real target events, what fraction were covered by some prediction
// whose window (with tolerance) contained them.
export const recall: Scorer = {
  id: "recall",
  label: "Recall",
  higherIsBetter: true,
  score(resolved, realEvents) {
    if (realEvents.length === 0) {
      return { id: this.id, label: this.label, value: 0, detail: "0/0", higherIsBetter: true };
    }
    let covered = 0;
    for (const ev of realEvents) {
      const hit = resolved.some(
        (r) =>
          r.target === ev.target &&
          ev.at >= r.windowStart - TOL &&
          ev.at <= r.windowEnd + TOL,
      );
      if (hit) covered += 1;
    }
    return {
      id: this.id,
      label: this.label,
      value: covered / realEvents.length,
      detail: `${covered}/${realEvents.length}`,
      higherIsBetter: true,
    };
  },
};
