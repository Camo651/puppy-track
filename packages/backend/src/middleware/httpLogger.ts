import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { areaLog } from "../logger";

const log = areaLog("http");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Correlation id header, echoed back so clients/proxies can line up logs. */
const REQUEST_ID_HEADER = "x-request-id";

/** Honor a sane inbound id, otherwise mint one. */
function resolveRequestId(req: Request): string {
  const incoming = req.header(REQUEST_ID_HEADER);
  if (incoming && incoming.length > 0 && incoming.length <= 200) return incoming;
  return randomUUID();
}

// Low-cardinality route label: prefer the matched route template (/puppy/:id)
// over the concrete path (/puppy/42) so logs group sensibly instead of
// exploding on ids.
function routeLabel(req: Request): string {
  const base = req.baseUrl ?? "";
  const matched = req.route?.path;
  if (matched) return `${base}${matched}` || "/";
  return req.path || "/";
}

/**
 * Logs the start and completion of every HTTP request. The start and finish
 * lines share a requestId (also echoed on the response) so a single request can
 * be traced end to end. Finish level follows status: 5xx error, 4xx warn,
 * otherwise info.
 */
export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const startedAt = process.hrtime.bigint();

  log.info("request start", {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const contentLength = Number(res.getHeader("content-length"));
    const fields = {
      requestId,
      method: req.method,
      route: routeLabel(req),
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      bytes: Number.isFinite(contentLength) ? contentLength : undefined,
    };

    if (res.statusCode >= 500) log.error("request finish", fields);
    else if (res.statusCode >= 400) log.warn("request finish", fields);
    else log.info("request finish", fields);
  });

  next();
}
