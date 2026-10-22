type Fields = Record<string, unknown>;

function emit(level: string, area: string, msg: string, fields?: Fields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    area,
    msg,
    ...(fields ?? {}),
  };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + "\n");
}

export function areaLog(area: string) {
  return {
    debug: (msg: string, fields?: Fields) => emit("debug", area, msg, fields),
    info: (msg: string, fields?: Fields) => emit("info", area, msg, fields),
    warn: (msg: string, fields?: Fields) => emit("warn", area, msg, fields),
    error: (msg: string, fields?: Fields) => emit("error", area, msg, fields),
  };
}

export function serializeError(e: unknown): { name?: string; message: string; stack?: string } {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
  return { message: String(e) };
}
