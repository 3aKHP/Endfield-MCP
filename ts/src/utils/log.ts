/**
 * Shared stderr logger.
 *
 * All EndField-MCP logging goes to stderr — stdout is reserved for the
 * MCP JSON-RPC channel in stdio mode. Each module that logs creates a
 * scoped logger via `createLogger("ef.xxx")` so log lines are prefixed
 * with their origin for easy filtering.
 *
 * Format: `<ISO timestamp> <LEVEL> <scope>: <message>`
 */

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface Logger {
  (level: LogLevel, msg: string): void;
}

export function createLogger(scope: string): Logger {
  return (level: LogLevel, msg: string): void => {
    const ts = new Date().toISOString();
    process.stderr.write(`${ts} ${level} ${scope}: ${msg}\n`);
  };
}
