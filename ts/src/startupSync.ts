/**
 * Startup data sync orchestration.
 *
 * Owns retry/backoff scheduling, single-flight locking, and the cache-clear
 * cascade triggered when sync writes new data. Mirrors the design of
 * PRTS-MCP's `ts/src/startupSync.ts`, simplified to a single dataset
 * (GameData tables) for now. New datasets (story, audio) plug in by adding
 * another `syncDataset` block — the orchestration scaffolding is reusable.
 *
 * Contract:
 * - Runs in a background task launched from `server.ts` before listen().
 * - Skips sync when `EF_DATA_PATH` is explicitly set (user manages their
 *   own data; we must not overwrite it).
 * - Each dataset syncs under a single-flight lock so overlapping retries
 *   share a mutex.
 * - Retries with exponential backoff (30s / 120s / 600s) when network is
 *   unavailable, then gives up until next process start.
 * - Clears data-layer caches when a sync writes new data so stale reads
 *   don't leak.
 */

import { join } from "node:path";
import { loadConfig } from "./config.js";
import {
  archiveSpecForDataset,
  GAMEDATA_TABLES,
} from "./data/datasets.js";
import { clearCharacterCaches } from "./data/characters.js";
import { clearTextCaches } from "./data/texts.js";
import { createLogger } from "./utils/log.js";
import {
  type SyncResult,
  syncReleaseArchive,
} from "./data/sync.js";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = createLogger("ef.sync");

// ---------------------------------------------------------------------------
// Single-flight + retry scaffolding
// ---------------------------------------------------------------------------

const SYNC_RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;
const syncInFlight = new Set<string>();
type SyncRunResult = "retry" | "done" | "skipped";

function shouldRetrySync(status: SyncResult["status"]): boolean {
  return status === "offline_fallback" || status === "no_data";
}

/**
 * Run a sync function under a single-flight lock keyed by label.
 *
 * Returns:
 *   - "skipped" if a sync with the same label is already running
 *   - "retry" if the sync function returned true (needs another attempt)
 *   - "done" if the sync function returned false (terminal state)
 */
async function singleFlightSync(
  label: string,
  runSync: () => Promise<boolean>,
): Promise<SyncRunResult> {
  if (syncInFlight.has(label)) {
    log("INFO", `${label} sync is already running; skipping overlapping attempt.`);
    return "skipped";
  }
  syncInFlight.add(label);
  try {
    return (await runSync()) ? "retry" : "done";
  } finally {
    syncInFlight.delete(label);
  }
}

/**
 * Schedule a retry with exponential backoff.
 *
 * Each delay is unref'd so the timer never keeps the process alive on its
 * own. After the last attempt fails, gives up until next process start.
 */
function scheduleSyncRetry(
  label: string,
  runSync: () => Promise<boolean>,
  attempt = 0,
): void {
  const delayMs = SYNC_RETRY_DELAYS_MS[attempt];
  if (delayMs === undefined) {
    log(
      "WARN",
      `${label} sync still needs retry after ${SYNC_RETRY_DELAYS_MS.length} attempts; waiting for next process start.`,
    );
    return;
  }

  const timer = setTimeout(() => {
    void singleFlightSync(label, runSync)
      .then((result) => {
        if (result === "skipped") scheduleSyncRetry(label, runSync, attempt);
        else if (result === "retry") scheduleSyncRetry(label, runSync, attempt + 1);
      })
      .catch((err: unknown) => {
        log(
          "ERROR",
          `${label} retry sync threw unexpectedly: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        scheduleSyncRetry(label, runSync, attempt + 1);
      });
  }, delayMs);
  timer.unref?.();

  log("INFO", `${label} sync will retry in ${Math.round(delayMs / 1000)}s.`);
}

// ---------------------------------------------------------------------------
// Per-dataset sync runners
// ---------------------------------------------------------------------------

function logSyncResult(label: string, r: SyncResult): void {
  const sha = r.commitSha ? r.commitSha.slice(0, 8) : "unknown";
  if (r.status === "updated") {
    log("INFO", `${label} updated from GitHub Release (${r.spec.repo} @ ${sha}).`);
  } else if (r.status === "up_to_date") {
    log("INFO", `${label} is up to date (${r.spec.repo} @ ${sha}).`);
  } else if (r.status === "offline_fallback") {
    log(
      "WARN",
      `Network unavailable; using cached ${label} (${r.spec.repo} @ ${sha}). Error: ${r.error}`,
    );
  } else {
    log("ERROR", `${label} sync failed — no data. Error: ${r.error}`);
  }
}

/**
 * Build the sync runner for the GameData tables dataset.
 *
 * The returned function returns `true` when a retry is needed (network
 * failure), `false` otherwise. Cache clearing is invoked when sync writes
 * new data; reader modules expose their own `clearXxxCaches()` once
 * implemented (SCHEMA_TODO: wire those imports when readers land).
 */
function makeTablesSyncRunner(
  localZip: string,
  localRoot: string,
): () => Promise<boolean> {
  const archiveSpec = archiveSpecForDataset(
    GAMEDATA_TABLES,
    localZip,
    localRoot,
  );

  return async (): Promise<boolean> => {
    const r = await syncReleaseArchive(archiveSpec);
    logSyncResult("GameData tables", r);
    if (r.status === "updated") {
      // Drop stale in-memory caches so the next read picks up the freshly
      // written files. Both layers must clear: text indices (i18n hash →
      // string maps) and the character table projection.
      clearTextCaches();
      clearCharacterCaches();
      // Future readers (item/enemy/stage) call their clearXxxCaches() here
      // as they land.
    }
    return shouldRetrySync(r.status);
  };
}

// ---------------------------------------------------------------------------
// Startup entry point
// ---------------------------------------------------------------------------

export async function runStartupSync(): Promise<void> {
  const cfg = loadConfig();
  const startupTasks: Promise<void>[] = [];

  if (cfg.isCustomDataPath) {
    log(
      "INFO",
      `EF_DATA_PATH is custom (${cfg.dataPath}); auto-sync disabled.`,
    );
    return;
  }

  // GameData tables
  if (GAMEDATA_TABLES.requiredFiles.length === 0) {
    log(
      "WARN",
      "GameData tables dataset has no requiredFiles pinned (SCHEMA_TODO); skipping sync until the mirror schema is finalized.",
    );
  } else {
    const localZip = join(cfg.dataPath, "archives", GAMEDATA_TABLES.assetName);
    const runTablesSync = makeTablesSyncRunner(localZip, cfg.dataPath);

    startupTasks.push(
      singleFlightSync("GameData tables", runTablesSync)
        .catch((err: unknown) => {
          log(
            "ERROR",
            `GameData tables sync threw unexpectedly: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return true;
        })
        .then((result) => {
          if (result !== "done") {
            scheduleSyncRetry("GameData tables", runTablesSync);
          }
        }),
    );
  }

  await Promise.all(startupTasks);
}
