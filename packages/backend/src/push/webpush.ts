import webpush from "web-push";
import { db, eq, pushSubscriptions } from "@puppy-track/db";
import type { PushSubscriptionJSON } from "@puppy-track/common";
import { config } from "../config";
import { areaLog, serializeError } from "../logger";

const log = areaLog("push");

let enabled = false;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export function initWebPush(): void {
  if (config.vapid.publicKey && config.vapid.privateKey) {
    try {
      webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
      enabled = true;
      log.info("web push initialized");
    } catch (e) {
      log.error("failed to apply VAPID details", { err: serializeError(e) });
    }
  } else {
    log.warn("VAPID keys not configured; push notifications disabled");
  }
}

export function isPushEnabled(): boolean {
  return enabled;
}

export function getVapidPublicKey(): string {
  return enabled ? config.vapid.publicKey : "";
}

export function saveSubscription(userId: string, sub: PushSubscriptionJSON): boolean {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return false;
  db.insert(pushSubscriptions)
    .values({
      endpoint: sub.endpoint,
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    .run();
  return true;
}

export function removeSubscription(endpoint: string): void {
  if (!endpoint) return;
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

async function deliver(
  targets: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<number> {
  if (!enabled || targets.length === 0) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.allSettled(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          body,
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          removeSubscription(t.endpoint);
        } else {
          log.error("failed to send notification", { err: serializeError(e) });
        }
      }
    }),
  );
  return sent;
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  const targets = db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .all();
  return deliver(targets, payload);
}

export async function sendToAll(payload: PushPayload): Promise<number> {
  const targets = db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .all();
  return deliver(targets, payload);
}
