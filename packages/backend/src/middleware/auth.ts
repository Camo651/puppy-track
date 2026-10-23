import type { NextFunction, Request, Response } from "express";
import { and, db, eq, gt, sessions, users } from "@puppy-track/db";
import type { User } from "@puppy-track/common";
import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "../config";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.header("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

function sessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  return bearer(req);
}

export function resolveSession(token: string): User | null {
  const now = Date.now();
  const rows = db
    .select({
      userId: users.id,
      username: users.username,
      globalName: users.globalName,
      avatar: users.avatar,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1)
    .all();

  const row = rows[0];
  if (!row) return null;

  db.update(sessions)
    .set({ lastSeen: now, expiresAt: now + SESSION_TTL_MS })
    .where(eq(sessions.token, token))
    .run();

  return {
    id: row.userId,
    username: row.username,
    globalName: row.globalName,
    avatar: row.avatar,
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const token = sessionToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const user = resolveSession(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = user;
  req.sessionToken = token;
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  next();
}
