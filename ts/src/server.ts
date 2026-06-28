#!/usr/bin/env bun
/**
 * Endfield-MCP server entry point.
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
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { loadConfig } from "./config.js";
import { createLogger } from "./utils/log.js";
import { bindWikiConfig } from "./api/endfieldWiki.js";
import { registerWikiTools } from "./tools/wikiTools.js";
import { registerGamedataTools } from "./tools/gamedataTools.js";
import { registerStoryTools } from "./tools/storyTools.js";
import { bindCharacterStore } from "./data/characters.js";
import { bindTextStore } from "./data/texts.js";
import { bindStoryStore } from "./data/story.js";
import { DirectoryStore, FallbackStore, type JsonStore } from "./data/stores.js";
import { runStartupSync } from "./startupSync.js";
import { runStdio } from "./transports/stdio.js";
import { runHttp } from "./transports/http.js";

// ---------------------------------------------------------------------------
// Logging + version
// ---------------------------------------------------------------------------

const SERVER_NAME = "Endfield_Wiki_Assistant";
// Single source of truth: read version from package.json rather than a
// hand-maintained string literal. A literal drifts out of sync on release
// (v0.3.2 shipped with the server reporting "0.3.1" because this constant
// wasn't bumped alongside package.json — v0.3.3 fixes that).
const SERVER_VERSION = pkg.version;

const log = createLogger("ef.server");

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
  registerStoryTools(server);
  return server;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cfg = loadConfig();
  bindWikiConfig(cfg);

  // Build the GameData store as a two-layer FallbackStore:
  //   primary  = auto-sync directory (cfg.dataPath, freshest when present)
  //   fallback = bundled directory  (cfg.bundledDataPath, ships with the
  //              npm package / Docker image, may be slightly stale)
  //
  // We always construct the FallbackStore (never a bare DirectoryStore)
  // because the synced directory may not exist at startup but can be
  // populated by a background sync moments later. DirectoryStore.exists()
  // naturally returns false for a missing directory, so FallbackStore
  // transparently falls through to bundled until sync writes files —
  // and then automatically picks up the synced files on the next read
  // (after cache clearing). A startup-time branch that binds a bare
  // DirectoryStore(bundled) when synced is absent would permanently miss
  // the later-synced data.
  const syncedExists = existsSync(cfg.dataPath);
  const bundledExists = existsSync(cfg.bundledDataPath);

  const dataStore: JsonStore = new FallbackStore(
    new DirectoryStore(cfg.dataPath),
    new DirectoryStore(cfg.bundledDataPath),
  );
  log(
    "INFO",
    `GameData store: FallbackStore(synced=${cfg.dataPath}${syncedExists ? "" : " [absent]"}, bundled=${cfg.bundledDataPath}${bundledExists ? "" : " [absent]"})`,
  );
  if (!syncedExists && !bundledExists) {
    log(
      "WARN",
      `No GameData available yet — both layers absent. GameData tools will report "no data" until the mirror is synced or bundled data is populated.`,
    );
  }

  // Text resolver must bind before character reader — the reader calls
  // resolveText() during projections, which needs the i18n index loaded.
  bindTextStore(dataStore);
  bindCharacterStore(dataStore);

  // Story store: always construct FallbackStore unconditionally (matching
  // the GameData pattern above). The synced/story directory may not exist
  // at startup but gets populated by background sync — DirectoryStore
  // returns false from exists() for missing dirs, so FallbackStore
  // transparently falls through until sync writes files. Gating the
  // binding on directory existence would permanently miss later-synced
  // data (the exact trap the GameData path was rewritten to avoid).
  const storySynced = join(cfg.dataPath, "story");
  const storyBundled = join(cfg.bundledDataPath, "story");
  const storySyncedExists = existsSync(storySynced);
  const storyBundledExists = existsSync(storyBundled);
  const storyStore: JsonStore = new FallbackStore(
    new DirectoryStore(storySynced),
    new DirectoryStore(storyBundled),
  );
  bindStoryStore(storyStore);
  log(
    "INFO",
    `Story store: FallbackStore(synced=${storySynced}${storySyncedExists ? "" : " [absent]"}, bundled=${storyBundled}${storyBundledExists ? "" : " [absent]"})`,
  );
  if (!storySyncedExists && !storyBundledExists) {
    log(
      "INFO",
      `Story data not yet available — both layers absent. Story tools will report "no data" until the v0.3.0 mirror sync completes.`,
    );
  }

  log(
    "INFO",
    `Endfield-MCP ${SERVER_VERSION} starting (transport=${cfg.transport}, wiki=${cfg.wikiEndpoint})`,
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
