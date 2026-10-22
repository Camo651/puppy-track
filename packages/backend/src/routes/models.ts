import { Router } from "express";
import { db, desc, eq, predictions as predictionsTable } from "@puppy-track/db";
import { setChampionSchema, type ModelInfo } from "@puppy-track/common";
import { requireUser } from "../middleware/auth";
import { getChampionId, setChampionId } from "../analyzer/champion";
import { getModel, modelRegistry } from "../analyzer/models";
import { scoreModel } from "../analyzer/scoring/service";
import { serializePrediction } from "../serialize";

export const modelsRouter = Router();

modelsRouter.get("/models", requireUser, (_req, res) => {
  const championId = getChampionId();
  const models: ModelInfo[] = modelRegistry.map((m) => ({
    id: m.id,
    label: m.label,
    version: m.version,
    isChampion: m.id === championId,
    score: scoreModel(m.id),
  }));
  res.json({ models });
});

modelsRouter.post("/models/champion", requireUser, (req, res) => {
  const parsed = setChampionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  if (!getModel(parsed.data.modelId)) {
    res.status(400).json({ error: "unknown_model" });
    return;
  }
  setChampionId(parsed.data.modelId);
  res.json({ champion: parsed.data.modelId });
});

modelsRouter.get("/models/:id/predictions", requireUser, (req, res) => {
  const id = req.params.id;
  if (!getModel(id)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const rows = db
    .select()
    .from(predictionsTable)
    .where(eq(predictionsTable.modelId, id))
    .orderBy(desc(predictionsTable.createdAt))
    .limit(limit)
    .all();
  res.json({ predictions: rows.map(serializePrediction) });
});
