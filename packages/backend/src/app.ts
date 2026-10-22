import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { API_PREFIX } from "@puppy-track/common";
import { config } from "./config";
import { areaLog, serializeError } from "./logger";
import { httpLogger } from "./middleware/httpLogger";
import { apiRouter } from "./routes";

const log = areaLog("http");

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(httpLogger);
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "256kb" }));

  app.use(API_PREFIX, apiRouter);

  // Unmatched API routes should never fall through to the SPA.
  app.use(API_PREFIX, (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  if (config.webDirExists()) {
    app.use(express.static(config.webDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith(API_PREFIX)) return next();
      res.sendFile(path.join(config.webDir, "index.html"));
    });
    log.info("serving built frontend", { webDir: config.webDir });
  } else {
    log.warn("frontend build not found; serving API only", { webDir: config.webDir });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error("unhandled error", { err: serializeError(err) });
    res.status(500).json({ error: "server_error" });
  });

  return app;
}
