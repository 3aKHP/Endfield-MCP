/**
 * Runtime configuration for EndField-MCP.
 *
 * Path design mirrors PRTS-MCP's config layer, adapted for the Endfield
 * data-source reality:
 *
 *   - Wiki content is fetched live from endfield.wiki.gg (MediaWiki 1.43.6),
 *     not from a local sync. The WAF there requires browser-like headers,
 *     so USER_AGENT / WIKI_REFERER / WIKI_ACCEPT are first-class config.
 *
 *   - GameData is mirrored to a self-hosted release repository (text-only
 *     JSON tables, no binary assets). EF_DATA_PATH points at the on-disk
 *     location where auto-sync writes those tables. A user-set EF_DATA_PATH
 *     disables auto-sync exactly like PRTS-MCP's GAMEDATA_PATH.
 *
 * Path priority (highest → lowest):
 *   1. EF_DATA_PATH env var          — user-supplied; auto-sync DISABLED.
 *   2. /data/endfield                — Docker volume (detected via
 *                                       EF_MCP_ROOT == "/app").
 *   3. Per-user data dir             — %LOCALAPPDATA%\endfield-mcp\ (Win)
 *                                       ~/.local/share/endfield-mcp/ (Unix).
 */

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Wiki endpoint constants
// ---------------------------------------------------------------------------

/**
 * Default MediaWiki API endpoint for the Endfield Talos Wiki.
 * endfield.wiki.gg runs MediaWiki 1.43.6; its WAF blocks bare/curl-like
 * User-Agents, so requests must carry a browser UA + Referer (see
 * endfieldWiki.ts).
 */
export const DEFAULT_WIKI_ENDPOINT = "https://endfield.wiki.gg/api.php";

/**
 * Referer sent with every wiki request. wiki.gg's WAF keyed on this during
 * probing — without it, api.php returns the "Blocked - wiki.gg" stub.
 */
export const DEFAULT_WIKI_REFERER = "https://endfield.wiki.gg/";

/**
 * Browser-style User-Agent. The WAF rejects the short bot UA we use for
 * GitHub; a realistic Chrome UA passes cleanly. Configurable via EF_WIKI_UA.
 */
export const DEFAULT_WIKI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Minimum seconds between wiki API requests (politeness, not WAF-driven). */
export const RATE_LIMIT_INTERVAL = 1.5;

// ---------------------------------------------------------------------------
// Package + bundled paths
// ---------------------------------------------------------------------------

const _PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const BUNDLED_DATA_PATH = join(_PACKAGE_ROOT, "data", "endfield");

// ---------------------------------------------------------------------------
// GameData path resolution
// ---------------------------------------------------------------------------

/** Fixed volume mount-point inside the Docker image. */
const DOCKER_VOLUME_PATH = "/data/endfield";

function resolveDefaultDataPath(): string {
  if (process.env["EF_MCP_ROOT"] === "/app") return DOCKER_VOLUME_PATH;

  if (process.platform === "win32") {
    const base =
      process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local");
    return join(base, "endfield-mcp", "data");
  }
  const base =
    process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
  return join(base, "endfield-mcp", "data");
}

export const DEFAULT_DATA_PATH = resolveDefaultDataPath();

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

export type Transport = "stdio" | "http";

export function resolveTransport(): Transport {
  const raw = (process.env["EF_TRANSPORT"] ?? "stdio").toLowerCase();
  if (raw === "http" || raw === "streamable-http") return "http";
  return "stdio";
}

// ---------------------------------------------------------------------------
// Config object
// ---------------------------------------------------------------------------

export interface Config {
  /** Wiki API endpoint (EF_WIKI_ENDPOINT override or default). */
  wikiEndpoint: string;
  /** Referer header for wiki requests. */
  wikiReferer: string;
  /** User-Agent header for wiki requests. */
  wikiUserAgent: string;
  /** Sync write target for GameData (volume or user dir). */
  dataPath: string;
  /** Bundled read-only GameData fallback path (Docker / npm bundle). */
  bundledDataPath: string;
  /** True when EF_DATA_PATH was explicitly set by the user. */
  isCustomDataPath: boolean;
  /** Transport selected via EF_TRANSPORT. */
  transport: Transport;
  /** HTTP port (when transport == "http"). */
  httpPort: number;
  /** HTTP host (when transport == "http"). */
  httpHost: string;
  /** Mirror URL cascade for GitHub-style asset downloads. */
  githubMirrors: string[];
}

export function loadConfig(): Config {
  const isCustomDataPath = "EF_DATA_PATH" in process.env;
  const dataPath = isCustomDataPath
    ? process.env["EF_DATA_PATH"]!
    : DEFAULT_DATA_PATH;

  return {
    wikiEndpoint: process.env["EF_WIKI_ENDPOINT"] ?? DEFAULT_WIKI_ENDPOINT,
    wikiReferer: process.env["EF_WIKI_REFERER"] ?? DEFAULT_WIKI_REFERER,
    wikiUserAgent: process.env["EF_WIKI_UA"] ?? DEFAULT_WIKI_UA,
    dataPath,
    bundledDataPath: BUNDLED_DATA_PATH,
    isCustomDataPath,
    transport: resolveTransport(),
    httpPort: Number(process.env["PORT"] ?? 3000),
    httpHost: process.env["HOST"] ?? "0.0.0.0",
    githubMirrors: parseMirrors(process.env["GITHUB_MIRRORS"] ?? ""),
  };
}

/** Parse GITHUB_MIRRORS env var into proxy base URLs (trailing slash stripped). */
/** Parse a GITHUB_MIRRORS env string into proxy base URLs (trailing slash stripped). */
export function parseMirrors(raw: string): string[] {
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .map((m) => m.replace(/\/+$/, ""));
}

// ---------------------------------------------------------------------------
// Data-completeness probe (used by sync orchestration in v0.2+)
// ---------------------------------------------------------------------------

/**
 * Files that must be present for the GameData domain to be considered
 * "complete". The concrete list will be pinned in v0.2 once the self-hosted
 * mirror's schema is finalized; for now this is a placeholder so the
 * sync/config plumbing compiles end-to-end.
 */
export const REQUIRED_DATA_FILES: readonly string[] = [];

export function filesComplete(root: string): boolean {
  if (REQUIRED_DATA_FILES.length === 0) return false;
  return REQUIRED_DATA_FILES.every((f) => {
    const p = join(root, f);
    return existsSync(p) && statSync(p).isFile();
  });
}
