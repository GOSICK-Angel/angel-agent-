import type { LogLevel, LogEntry, Logger } from "./types.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_ENTRIES = 1000;

export function createLogger(module: string): Logger {
  let entries: readonly LogEntry[] = [];
  let currentLevel: LogLevel = "info";

  function log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      module,
      message,
      ...(data !== undefined ? { data } : {}),
      timestamp: Date.now(),
    };

    const updated = [...entries, entry];
    entries =
      updated.length > MAX_ENTRIES ? updated.slice(updated.length - MAX_ENTRIES) : updated;
  }

  return {
    debug: (message, data) => log("debug", message, data),
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    setLevel: (level: LogLevel) => {
      currentLevel = level;
    },
    getEntries: () => entries,
  };
}
