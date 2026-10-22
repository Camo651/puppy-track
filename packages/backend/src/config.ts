import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveWebDir(): string {
  const explicit = process.env.WEB_DIR;
  if (explicit) return path.isAbsolute(explicit) ? explicit : path.resolve(repoRoot, explicit);
  return path.resolve(repoRoot, "packages/frontend/dist");
}

export const config = {
  appEnv: process.env.APP_ENV || "local",
  isProd: (process.env.NODE_ENV || process.env.APP_ENV) === "production",
  port: num(process.env.PORT, 8080),

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  puppy: {
    name: process.env.PUPPY_NAME || "",
    // yyyy-mm-dd
    birthdate: process.env.PUPPY_BIRTHDATE || "",
  },

  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    redirectUri: process.env.DISCORD_REDIRECT_URI || "http://localhost:5173/api/auth/discord/callback",
    allowedIds: list(process.env.ALLOWED_DISCORD_IDS),
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    subject: process.env.VAPID_SUBJECT || "mailto:admin@puppy-track.local",
  },

  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 365),

  analyzer: {
    intervalMs: num(process.env.ANALYZER_INTERVAL_MS, 120_000),
    halfLifeDays: num(process.env.ANALYZER_HALFLIFE_DAYS, 4),
    confidenceThreshold: num(process.env.ANALYZER_CONFIDENCE_THRESHOLD, 0.35),
    leadMinutes: num(process.env.ANALYZER_LEAD_MINUTES, 15),
    lookbackDays: num(process.env.ANALYZER_LOOKBACK_DAYS, 21),
    championModel: process.env.ANALYZER_CHAMPION_MODEL || "context-ensemble",
    contextWindowHours: num(process.env.ANALYZER_CONTEXT_WINDOW_HOURS, 8),
    scoringWindowDays: num(process.env.ANALYZER_SCORING_WINDOW_DAYS, 14),
  },

  webDir: resolveWebDir(),
  webDirExists(): boolean {
    return fs.existsSync(path.join(this.webDir, "index.html"));
  },
};

export const SESSION_TTL_MS = config.sessionTtlDays * 24 * 60 * 60 * 1000;
