import { initDb } from "@puppy-track/db";
import { config } from "./config";
import { areaLog } from "./logger";
import { createApp } from "./app";
import { initWebPush } from "./push/webpush";
import { startAnalyzer } from "./analyzer/scheduler";

const log = areaLog("startup");

function main(): void {
  initDb();
  initWebPush();

  const app = createApp();
  app.listen(config.port, () => {
    log.info("puppy-track started", {
      port: config.port,
      appEnv: config.appEnv,
      allowedUsers: config.discord.allowedIds.length,
    });
    startAnalyzer();
  });
}

main();
