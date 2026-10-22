import { randomUUID } from "crypto";
import os from "os";
import path from "path";

// Point the db client at a throwaway sqlite file, unique per test file, before
// any module reads these values. The real client runs migrations on connect, so
// each run gets a schema-correct, empty database.
const dir = path.join(os.tmpdir(), `puppy-track-test-${process.pid}-${randomUUID()}`);
process.env.DB_DIR = dir;
process.env.DB_FILE = "test.sqlite";
process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
