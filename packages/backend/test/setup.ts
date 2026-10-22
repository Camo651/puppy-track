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

// Pin analyzer tunables to their documented defaults so assertions about
// confidence, lead time, and lookback do not depend on a developer's .env.
process.env.ANALYZER_HALFLIFE_DAYS = "4";
process.env.ANALYZER_CONFIDENCE_THRESHOLD = "0.35";
process.env.ANALYZER_LEAD_MINUTES = "15";
process.env.ANALYZER_LOOKBACK_DAYS = "21";
process.env.ANALYZER_INTERVAL_MS = "120000";
process.env.ANALYZER_CHAMPION_MODEL = "context-ensemble";
process.env.ANALYZER_CONTEXT_WINDOW_HOURS = "8";
process.env.ANALYZER_SCORING_WINDOW_DAYS = "14";
