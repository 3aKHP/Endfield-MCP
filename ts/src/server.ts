#!/usr/bin/env bun
/**
 * EndField-MCP server entry point.
 *
 * Creates the McpServer instance, binds the wiki client to the loaded
 * config, registers tools, then dispatches to the transport selected by
 * EF_TRANSPORT:
 *
 *   stdio (default) — for local Claude Desktop / Claude Code / Chatbox
 *   http            — stateless Streamable HTTP via Bun.serve (remote use)
 *
 * One TS implementation covers both transports (the historical reason
 * PRTS-MCP needed a second TS implementation alongside Python — asyncio
 * friction with Streamable HTTP — does not apply when the runtime is
 * already Bun/TS end-to-end).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { bindWikiConfig } from "./api/endfieldWiki.js";
import { registerWikiTools } from "./tools/wikiTools.js";
import { registerGamedataTools } from "./tools/gamedataTools.js";
import { bindCharacterStore } from "./data/characters.js";
import { bindTextStore } from "./data/texts.js";
import { DirectoryStore, FallbackStore, type JsonStore } from "./data/stores.js";
import { runStartupSync } from "./startupSync.js";
import { runStdio } from "./transports/stdio.js";
import { runHttp } from "./transports/http.js";

// ---------------------------------------------------------------------------
// Logging + version
// ---------------------------------------------------------------------------

const SERVER_NAME = "Endfield_Wiki_Assistant";
const SERVER_VERSION = "0.2.0-dev.0";

function log(level: "INFO" | "WARN" | "ERROR", msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} ${level} ef.server: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// MCP Server factory
// ---------------------------------------------------------------------------

/**
 * Build a configured McpServer with all tools registered.
 *
 * Wiki client binding happens once per process at startup; the client
 * reads its endpoint/UA/Referer from that binding, so per-request server
 * instances (HTTP transport creates one per request) all share the same
 * wiki config snapshot.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerWikiTools(server);
  registerGamedataTools(server);
  // Future domains (items, stages, enemies) register here as they land.
  return server;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cfg = loadConfig();
  bindWikiConfig(cfg);

  // Build the GameData store with a two-layer fallback chain:
  //   primary  = auto-sync directory (cfg.dataPath, freshest when present)
  //   fallback = bundled directory  (cfg.bundledDataPath, ships with the
  //              npm package / Docker image, may be slightly stale)
  //
  // Both layers are optional; we bind whichever exist:
  //   - both present  → FallbackStore(primary, bundled)
  //   - only one      → that layer directly
  //   - neither       → no binding; GameData tools report "no data"
  const syncedExists = existsSync(cfg.dataPath);
  const bundledExists = existsSync(cfg.bundledDataPath);

  let dataStore: JsonStore | null = null;
  if (syncedExists && bundledExists) {
    dataStore = new FallbackStore(
      new DirectoryStore(cfg.dataPath),
      new DirectoryStore(cfg.bundledDataPath),
    );
    log(
      "INFO",
      `GameData store: FallbackStore(synced=${cfg.dataPath}, bundled=${cfg.bundledDataPath})`,
    );
  } else if (syncedExists) {
    dataStore = new DirectoryStore(cfg.dataPath);
    log("INFO", `GameData store: synced only (${cfg.dataPath})`);
  } else if (bundledExists) {
    dataStore = new DirectoryStore(cfg.bundledDataPath);
    log(
      "WARN",
      `GameData store: bundled only (${cfg.bundledDataPath}) — auto-sync dir absent, data may be stale.`,
    );
  } else {
    log(
      "WARN",
      `No GameData available (synced=${cfg.dataPath} absent, bundled=${cfg.bundledDataPath} absent). GameData tools will report "no data" until the mirror is synced.`,
    );
  }

  if (dataStore !== null) {
    // Text resolver must bind before character reader — the reader calls
    // resolveText() during projections, which needs the i18n index loaded.
    bindTextStore(dataStore);
    bindCharacterStore(dataStore);
  }

  log(
    "INFO",
    `EndField-MCP ${SERVER_VERSION} starting (transport=${cfg.transport}, wiki=${cfg.wikiEndpoint})`,
  );

  // Fire-and-forget. In v0.1 this is a no-op; in v0.2+ the background
  // thread handles mirror sync without blocking server startup.
  void runStartupSync().catch((err: unknown) => {
    log(
      "ERROR",
      `Startup sync threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  if (cfg.transport === "http") {
    await runHttp(createMcpServer, {
      port: cfg.httpPort,
      host: cfg.httpHost,
    });
  } else {
    await runStdio(createMcpServer());
  }
}

main().catch((err: unknown) => {
  log(
    "ERROR",
    `Fatal: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
