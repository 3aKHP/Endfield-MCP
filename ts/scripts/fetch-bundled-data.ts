#!/usr/bin/env bun
/**
 * Fetch bundled Endfield game data into a target directory.
 *
 * Used by the CD pipeline (and by developers who want a local bundled
 * snapshot) to populate ts/data/endfield/ before the npm package is
 * packed or the Docker image is built. Downloads the latest release
 * assets from 3aKHP/EndFieldGameData and extracts them.
 *
 * Pulls two datasets:
 *   - GAMEDATA_TABLES (endfield-tables.zip)  → tables/ + i18n/  (v0.2.0+)
 *   - STORY_CN       (endfield-story-CN.zip) → story/           (v0.3.1+)
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
  STORY_CN,
  type ReleaseDatasetSpec,
} from "../src/data/datasets.js";
import { syncReleaseArchive } from "../src/data/sync.js";

// Script lives at ts/scripts/fetch-bundled-data.ts. Two dirnames up = ts/.
const _tsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOut = join(_tsRoot, "data", "endfield");
const outDir = process.argv[2] ?? defaultOut;

/**
 * Per-dataset fetch target. Each dataset extracts into one or more
 * subdirectories under outDir; these align with how the runtime store
 * resolves bundled paths (server.ts binds story bundled at
 * bundledDataPath/story; tables/i18n sit directly under bundledDataPath).
 */
interface FetchTarget {
  readonly spec: ReleaseDatasetSpec;
  /**
   * Subdirectory under outDir where this dataset extracts (zip entries
   * land directly here). Empty string = outDir itself.
   */
  readonly extractDir: string;
  /**
   * Directories this dataset owns, relative to outDir. Cleared before
   * re-fetching so stale files don't linger when an upstream release
   * drops a table or a conv scene. Listed explicitly (rather than
   * wiping extractDir) so a dataset whose extractDir IS outDir does
   * not nuke outDir itself — that would destroy .gitkeep and sibling
   * datasets' data.
   */
  readonly ownedDirs: readonly string[];
}

const TARGETS: readonly FetchTarget[] = [
  // Tables ship flat at outDir root (outDir/tables/, outDir/i18n/) — the
  // zip's internal top-level "tables/" and "i18n/" dirs land directly in
  // outDir. extractDir is outDir itself, but ownedDirs only lists the two
  // product dirs so outDir (and .gitkeep) survive the clear.
  {
    spec: GAMEDATA_TABLES,
    extractDir: "",
    ownedDirs: ["tables", "i18n"],
  },
  // Story extracts into outDir/story/ — matches storyBundled path in
  // server.ts (join(bundledDataPath, "story")). The zip's top-level
  // index.json / missions.json / conv/ land directly in story/.
  { spec: STORY_CN, extractDir: "story", ownedDirs: ["story"] },
];

console.log(`=== fetch-bundled-data ===`);
console.log(`output dir: ${outDir}`);
console.log(
  `datasets:  ${TARGETS.map((t) => `${t.spec.datasetId} (${t.spec.assetName})`).join(", ")}`,
);
console.log("");

mkdirSync(outDir, { recursive: true });

let hadFailure = false;

for (const target of TARGETS) {
  const { spec } = target;
  const localRoot = target.extractDir ? join(outDir, target.extractDir) : outDir;

  console.log(`--- ${spec.datasetId} ---`);
  console.log(`asset:   ${spec.assetName}`);
  console.log(`target:  ${localRoot}`);

  // Clear only the directories this dataset owns (relative to outDir) so a
  // re-run doesn't leave stale conv files when a scene is dropped upstream
  // — without nuking outDir itself (which would destroy .gitkeep and
  // sibling datasets' data, a trap that bit the first version of this).
  for (const dir of target.ownedDirs) {
    const abs = join(outDir, dir);
    if (existsSync(abs)) {
      console.log(`clearing existing ${abs}`);
      rmSync(abs, { recursive: true, force: true });
    }
  }
  mkdirSync(localRoot, { recursive: true });

  const localZip = join(localRoot, "archives", spec.assetName);
  const archiveSpec = archiveSpecForDataset(spec, localZip, localRoot);

  console.log(`downloading latest release...`);
  const result = await syncReleaseArchive(archiveSpec);
  console.log(`status:  ${result.status}`);
  console.log(`tag:     ${result.commitSha ?? "(unknown)"}`);
  if (result.error) console.log(`error:   ${result.error}`);

  if (result.status === "no_data") {
    console.error("");
    console.error(
      `FAILED: could not fetch ${spec.assetName} (network error and no cache).`,
    );
    console.error(
      "CD should fail rather than ship an npm package with empty bundled data.",
    );
    hadFailure = true;
    // Drop the transport zip and move on so the failure log is complete,
    // but the script will exit non-zero after the loop.
    rmSync(join(localRoot, "archives"), { recursive: true, force: true });
    console.log("");
    continue;
  }

  if (result.status === "offline_fallback") {
    console.warn("");
    console.warn(
      `WARNING: ${spec.assetName} used cached/offline data — snapshot may be stale.`,
    );
  }

  // Drop the transport zip — only extracted contents belong in the bundle.
  rmSync(join(localRoot, "archives"), { recursive: true, force: true });

  console.log(`✓ ${spec.datasetId} ready`);
  console.log("");
}

if (hadFailure) {
  console.error("=== FAILED — one or more datasets could not be fetched ===");
  process.exit(1);
}

console.log(`✓ all bundled data ready at ${outDir}`);
