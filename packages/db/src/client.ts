import fs from "fs";
import path from "path";

import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

// The database lives in the repo-root `.db` directory. In production that path is
// a persistent volume bind-mounted there (see docker-compose.yml / VOLUME_PATH).
const repoRoot = path.resolve(__dirname, "../../..");

let instance: Db | null = null;

function openSqlite(): Database.Database {
  // Tests run against a throwaway in-memory database: a clean, migrated schema
  // per run that never touches the real data file.
  if (process.env.NODE_ENV === "test") return new Database(":memory:");

  const dir = path.join(repoRoot, ".db");
  fs.mkdirSync(dir, { recursive: true });
  return new Database(path.join(dir, "puppy-track.sqlite"));
}

function connect(): Db {
  const sqlite = openSqlite();
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const d = drizzle(sqlite, { schema });
  migrate(d, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  return d;
}

function getDb(): Db {
  return (instance ??= connect());
}

export function initDb(): void {
  getDb();
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});
