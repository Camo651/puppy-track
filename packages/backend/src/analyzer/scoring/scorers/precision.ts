import type { Scorer } from "../types";

// Of the predictions that resolved, what fraction were hits.
export const precision: Scorer = {
  id: "precision",
  label: "Precision",
  higherIsBetter: true,
  score(resolved) {
    const done = resolved.filter((r) => r.outcome !== "pending");
    const hits = done.filter((r) => r.outcome === "hit").length;
    const value = done.length ? hits / done.length : 0;
    return {
      id: this.id,
      label: this.label,
      value,
      detail: `${hits}/${done.length}`,
      higherIsBetter: true,
    };
  },
};
