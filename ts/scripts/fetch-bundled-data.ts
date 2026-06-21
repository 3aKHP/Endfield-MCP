#!/usr/bin/env bun
/**
 * Fetch bundled Endfield game data into a target directory.
 *
 * Used by the CD pipeline (and by developers who want a local bundled
 * snapshot) to populate ts/data/endfield/ before the npm package is
 * packed or the Docker image is built. Downloads the latest
 * endfield-tables.zip from 3aKHP/EndFieldGameData and extracts it.
 *
 * Unlike the runtime sync path (startupSync.ts → sync.ts), this script:
 *   - always downloads (ignores TTL cache)
 *   - writes to a caller-specified directory (defaults to ts/data/endfield)
 *   - exits non-zero on failure (CD should fail rather than ship empty data)
 *
 * Usage:
 *   bun run ts/scripts/fetch-bundled-data.ts [output_dir]
 *
 * Env:
 *   GITHUB_TOKEN     optional, raises GitHub API rate limit
 *   GITHUB_MIRRORS   optional, comma-separated ghproxy-style URLs
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveSpecForDataset,
  GAMEDATA_TABLES,
} from "../src/data/datasets.js";
import { syncReleaseArchive } from "../src/data/sync.js";

// Script lives at ts/scripts/fetch-bundled-data.ts. Two dirnames up = ts/.
const _tsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOut = join(_tsRoot, "data", "endfield");
const outDir = process.argv[2] ?? defaultOut;

console.log(`=== fetch-bundled-data ===`);
console.log(`output dir: ${outDir}`);
console.log(`mirror:     ${GAMEDATA_TABLES.owner}/${GAMEDATA_TABLES.repo}`);
console.log(`asset:      ${GAMEDATA_TABLES.assetName}`);
console.log("");

// Clean any previous bundled contents so stale files don't linger when
// the upstream schema drops a table.
if (existsSync(outDir)) {
  console.log(`clearing existing contents of ${outDir}`);
  // Remove subdirectories (tables/, i18n/) and the zip archive, but keep
  // the directory itself (and any .gitkeep — recreated below if needed).
  rmSync(join(outDir, "tables"), { recursive: true, force: true });
  rmSync(join(outDir, "i18n"), { recursive: true, force: true });
  rmSync(join(outDir, "archives"), { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

const localZip = join(outDir, "archives", GAMEDATA_TABLES.assetName);
const spec = archiveSpecForDataset(GAMEDATA_TABLES, localZip, outDir);

console.log(`downloading latest release...`);
const result = await syncReleaseArchive(spec);
console.log(`status:     ${result.status}`);
console.log(`tag:        ${result.commitSha ?? "(unknown)"}`);
if (result.error) console.log(`error:      ${result.error}`);

if (result.status === "no_data") {
  console.error("");
  console.error(
    "FAILED: could not fetch bundled data (network error and no cache).",
  );
  console.error(
    "CD should fail rather than ship an npm package with empty bundled data.",
  );
  process.exit(1);
}

if (result.status === "offline_fallback") {
  console.warn("");
  console.warn(
    "WARNING: used cached/offline data — bundled snapshot may be stale.",
  );
}

// Drop the zip archive itself — only the extracted tables/i18n belong in
// the bundle. The zip was just the transport.
rmSync(join(outDir, "archives"), { recursive: true, force: true });

console.log("");
console.log(`✓ bundled data ready at ${outDir}`);
