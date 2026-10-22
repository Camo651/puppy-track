import { randomBytes } from "crypto";
import { Router } from "express";
import { db, eq, sessions, users } from "@puppy-track/db";
import { config, SESSION_TTL_MS } from "../config";
import { areaLog, serializeError } from "../logger";
import { requireUser } from "../middleware/auth";

const log = areaLog("auth");
export const authRouter = Router();

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function createSession(userId: string): string {
  const token = newToken();
  const now = Date.now();
  db.insert(sessions)
    .values({ token, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS, lastSeen: now })
    .run();
  return token;
}

authRouter.get("/auth/discord/login", (_req, res) => {
  if (!config.discord.clientId) {
    res.status(500).json({ error: "discord_not_configured" });
    return;
  }
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: "code",
    scope: "identify",
    state: randomBytes(12).toString("hex"),
    prompt: "none",
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

authRouter.get("/auth/discord/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const fail = (reason: string) =>
    res.redirect(`${config.frontendUrl}/login?error=${encodeURIComponent(reason)}`);

  if (!code) {
    fail("missing_code");
    return;
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.discord.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      log.warn("token exchange failed", { status: tokenRes.status });
      fail("token_exchange_failed");
      return;
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      fail("token_exchange_failed");
      return;
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userRes.ok) {
      fail("user_fetch_failed");
      return;
    }
    const discordUser = (await userRes.json()) as DiscordUser;

    if (!config.discord.allowedIds.includes(discordUser.id)) {
      log.warn("access denied for discord user", { id: discordUser.id, username: discordUser.username });
      fail("not_allowed");
      return;
    }

    const now = Date.now();
    db.insert(users)
      .values({
        id: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.global_name,
        avatar: discordUser.avatar,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: discordUser.username,
          globalName: discordUser.global_name,
          avatar: discordUser.avatar,
        },
      })
      .run();

    const sessionToken = createSession(discordUser.id);
    log.info("user signed in", { id: discordUser.id, username: discordUser.username });
    res.redirect(`${config.frontendUrl}/auth/callback?token=${encodeURIComponent(sessionToken)}`);
  } catch (e) {
    log.error("discord callback error", { err: serializeError(e) });
    fail("server_error");
  }
});

authRouter.get("/auth/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/auth/logout", requireUser, (req, res) => {
  if (req.sessionToken) {
    db.delete(sessions).where(eq(sessions.token, req.sessionToken)).run();
  }
  res.json({ ok: true });
});
