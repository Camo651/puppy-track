import { Router } from "express";
import type { PushSubscriptionJSON } from "@puppy-track/common";
import { requireUser } from "../middleware/auth";
import { getVapidPublicKey, saveSubscription, sendToUser, removeSubscription, isPushEnabled } from "../push/webpush";

export const pushRouter = Router();

pushRouter.get("/push/vapid-public-key", requireUser, (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

pushRouter.post("/push/subscribe", requireUser, (req, res) => {
  const sub = req.body as PushSubscriptionJSON;
  const ok = saveSubscription(req.user!.id, sub);
  if (!ok) {
    res.status(400).json({ error: "invalid_subscription" });
    return;
  }
  res.json({ ok: true });
});

pushRouter.post("/push/unsubscribe", requireUser, (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  removeSubscription(endpoint);
  res.json({ ok: true });
});

pushRouter.post("/push/test", requireUser, async (req, res) => {
  if (!isPushEnabled()) {
    res.status(503).json({ error: "push_not_configured" });
    return;
  }
  const sent = await sendToUser(req.user!.id, {
    title: "Puppy Track test",
    body: "Notifications are working on this device.",
    url: "/notifications",
    tag: "test",
  });
  res.json({ ok: true, sent });
});
