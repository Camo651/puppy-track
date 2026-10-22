import fs from "fs";
import path from "path";

import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { dbEnv } from "./env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

function resolveDbDir(): string {
  if (path.isAbsolute(dbEnv.DB_DIR)) return dbEnv.DB_DIR;
  return path.resolve(dbEnv.repoRoot, dbEnv.DB_DIR);
}

let instance: Db | null = null;

function connect(): Db {
  const dir = resolveDbDir();
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, dbEnv.DB_FILE));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const d = drizzle(sqlite, { schema });
  if (process.env.DB_SKIP_MIGRATE !== "1") {
    migrate(d, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  }
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
