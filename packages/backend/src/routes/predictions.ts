import { Router } from "express";
import { db, desc, eq, predictions as predictionsTable } from "@puppy-track/db";
import { predictionFeedbackSchema } from "@puppy-track/common";
import { requireUser } from "../middleware/auth";
import { getChampionId } from "../analyzer/champion";
import { serializePrediction } from "../serialize";

export const predictionsRouter = Router();

// The Alerts feed shows only the champion model's predictions.
predictionsRouter.get("/predictions", requireUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db
    .select()
    .from(predictionsTable)
    .where(eq(predictionsTable.modelId, getChampionId()))
    .orderBy(desc(predictionsTable.createdAt))
    .limit(limit)
    .all();
  res.json({ predictions: rows.map(serializePrediction) });
});

predictionsRouter.post("/predictions/:id/feedback", requireUser, (req, res) => {
  const parsed = predictionFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const id = req.params.id;
  const existing = db.select().from(predictionsTable).where(eq(predictionsTable.id, id)).all()[0];
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  db.update(predictionsTable)
    .set({ status: parsed.data.happened ? "confirmed" : "denied", feedbackAt: Date.now() })
    .where(eq(predictionsTable.id, id))
    .run();

  const row = db.select().from(predictionsTable).where(eq(predictionsTable.id, id)).all()[0];
  res.json({ prediction: serializePrediction(row) });
});
