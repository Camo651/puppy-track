import type { EventType } from "@puppy-track/common";
import { config } from "../config";
import { areaLog, serializeError } from "../logger";
import { getChampionId } from "./champion";
import { matchAll } from "./resolver";
import { runOnce } from "./runner";

const log = areaLog("analyzer");

export { runOnce };

export function onEventLogged(
  eventId: string,
  type: EventType,
  occurredAt: number,
  amount?: number | null,
): void {
  try {
    matchAll({ id: eventId, type, occurredAt, amount });
  } catch (e) {
    log.error("event match failed", { err: serializeError(e) });
  }
  void runOnce();
}

let timer: NodeJS.Timeout | null = null;

export function startAnalyzer(): void {
  if (timer) return;
  log.info("analyzer started", {
    intervalMs: config.analyzer.intervalMs,
    halfLifeDays: config.analyzer.halfLifeDays,
    confidenceThreshold: config.analyzer.confidenceThreshold,
    champion: getChampionId(),
  });
  void runOnce();
  timer = setInterval(() => void runOnce(), config.analyzer.intervalMs);
  timer.unref?.();
}
