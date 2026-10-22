import { Router } from "express";
import { requireUser } from "../middleware/auth";
import { config } from "../config";

export const puppyRouter = Router();

puppyRouter.get("/puppy", requireUser, (_req, res) => {
  const bdayMs = config.puppy.birthdate ? Date.parse(config.puppy.birthdate) : NaN;
  res.json({
    puppy: {
      name: config.puppy.name.trim() || null,
      birthdate: Number.isFinite(bdayMs) ? bdayMs : null,
    },
  });
});
