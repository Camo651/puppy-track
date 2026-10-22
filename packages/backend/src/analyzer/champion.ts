import { db, eq, settings as settingsTable } from "@puppy-track/db";
import { config } from "../config";
import { DEFAULT_CHAMPION, getModel } from "./models";

const KEY = "champion_model";

// The model whose predictions notify and own the Alerts feed. Persisted in the
// settings table; falls back to the configured default (then the hard default).
export function getChampionId(): string {
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, KEY)).all()[0];
  const id = row?.value ?? config.analyzer.championModel ?? DEFAULT_CHAMPION;
  return getModel(id) ? id : DEFAULT_CHAMPION;
}

export function setChampionId(id: string): void {
  if (!getModel(id)) throw new Error("unknown_model");
  const now = Date.now();
  db.insert(settingsTable)
    .values({ key: KEY, value: id, updatedAt: now })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: id, updatedAt: now } })
    .run();
}
