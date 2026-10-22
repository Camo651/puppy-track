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

// Analyzer tuning constants. Calibrated from backtests; part of the model's
// behavior rather than per-deployment configuration, so they are fixed in code.
const analyzer = {
  intervalMs: 120_000,
  halfLifeDays: 4,
  confidenceThreshold: 0.35,
  leadMinutes: 15,
  lookbackDays: 21,
  championModel: "context-ensemble",
  contextWindowHours: 8,
  scoringWindowDays: 14,
};

// How long a sign-in stays valid, in days. Slides forward on every request.
const SESSION_TTL_DAYS = 365;

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

  sessionTtlDays: SESSION_TTL_DAYS,

  analyzer,

  webDir: path.resolve(repoRoot, "packages/frontend/dist"),
  webDirExists(): boolean {
    return fs.existsSync(path.join(this.webDir, "index.html"));
  },
};

export const SESSION_TTL_MS = config.sessionTtlDays * 24 * 60 * 60 * 1000;
