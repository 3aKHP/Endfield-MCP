/**
 * Live smoke test for v0.4.0 worldview tools.
 *
 * Verifies the PRTS archive + in-game encyclopedia readers against real
 * mirror data. Because PRTS body text resolves through i18n/CN.json (shipped
 * in the v0.2.0 tables bundle, NOT the worldview bundle), this script binds
 * TWO stores — mirroring server.ts's layout:
 *
 *   - text store    = tables bundle (provides i18n/CN.json for body resolution)
 *   - worldview store = worldview bundle (prts/, wiki/, TextTable.json)
 *
 * Exercises the full resolution chain end-to-end:
 *   listLoreCategories → searchWorldview → readLoreDocument (contentId→TextTable→i18n)
 *                        → readWikiEntry + wikiEntriesForPrts (cross-link)
 *
 * Run: bun run ts/scripts/smoke-worldview.ts
 *
 * This script hits the real mirror (live network) — it is NOT part of `bun test`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryStore } from "../src/data/stores.js";
import { bindTextStore } from "../src/data/texts.js";
import {
  bindWorldviewStore,
  clearWorldviewCaches,
  hasWorldviewData,
  listLoreCategories,
  readLoreDocument,
  readWikiEntry,
  searchWorldview,
  wikiEntriesForPrts,
} from "../src/data/worldview.js";
import {
  archiveSpecForDataset,
  GAMEDATA_TABLES,
  WORLDVIEW,
} from "../src/data/datasets.js";
import { syncReleaseArchive } from "../src/data/sync.js";

const TMP = mkdtempSync(join(tmpdir(), "ef-worldview-smoke-"));

try {
  // ----- Sync the tables bundle (for i18n/CN.json) -----
  console.log("=== syncing tables bundle (for i18n) ===");
  const tablesRoot = join(TMP, "tables");
  const tablesZip = join(tablesRoot, "archives", GAMEDATA_TABLES.assetName);
  const tablesResult = await syncReleaseArchive(
    archiveSpecForDataset(GAMEDATA_TABLES, tablesZip, tablesRoot),
  );
  console.log(
    `tables sync: ${tablesResult.status}, tag: ${tablesResult.commitSha}`,
  );
  if (tablesResult.status === "no_data") {
    console.error("FAILED: tables sync returned no_data — cannot resolve i18n");
    process.exit(1);
  }

  // ----- Sync the worldview bundle -----
  console.log("\n=== syncing worldview bundle ===");
  const worldviewRoot = join(TMP, "worldview");
  const worldviewZip = join(worldviewRoot, "archives", WORLDVIEW.assetName);
  const worldviewResult = await syncReleaseArchive(
    archiveSpecForDataset(WORLDVIEW, worldviewZip, worldviewRoot),
  );
  console.log(
    `worldview sync: ${worldviewResult.status}, tag: ${worldviewResult.commitSha}`,
  );
  if (worldviewResult.status === "no_data") {
    console.error("FAILED: worldview sync returned no_data");
    process.exit(1);
  }

  // ----- Bind both stores (text store from tables, worldview from its bundle) -----
  console.log("\n=== binding stores ===");
  const textStore = new DirectoryStore(tablesRoot);
  bindTextStore(textStore);
  const worldviewStore = new DirectoryStore(worldviewRoot);
  bindWorldviewStore(worldviewStore);
  clearWorldviewCaches();

  console.log(`hasWorldviewData: ${hasWorldviewData()}`);

  // ----- listLoreCategories -----
  console.log("\n=== listLoreCategories() (PRTS + Wiki) ===");
  const cats = listLoreCategories();
  console.log(`PRTS categories: ${cats.length}`);
  for (const c of cats) {
    console.log(`  ${c.categoryId}: ${c.displayName} (${c.groupCount} groups)`);
  }

  // ----- searchWorldview -----
  console.log("\n=== searchWorldview('塔卫二') (first 5) ===");
  const hits = searchWorldview("塔卫二", 5);
  console.log(`${hits.length} matches:`);
  for (const h of hits) {
    console.log(
      `  ${h.itemId} | ${h.type} | ${h.title}\n    ${h.snippet.slice(0, 90)}`,
    );
  }

  // ----- readLoreDocument (the full resolution chain) -----
  if (hits.length > 0) {
    const docId = hits[0]!.itemId;
    console.log(`\n=== readLoreDocument('${docId}') ===`);
    const doc = readLoreDocument(docId);
    if (doc === null) {
      console.error("FAILED: readLoreDocument returned null for a search hit");
    } else {
      console.log(`title: ${doc.title}`);
      console.log(`type: ${doc.type} | category: ${doc.categoryId}`);
      console.log(
        `body (${doc.body.length} chars): ${doc.body.slice(0, 200)}${doc.body.length > 200 ? "..." : ""}`,
      );
      // Reverse cross-link: wiki entries referencing this document.
      const refs = wikiEntriesForPrts(docId);
      console.log(`wiki entries referencing this doc: ${refs.length}`);
      for (const r of refs.slice(0, 3)) {
        console.log(`  ${r}`);
      }
    }
  }

  // ----- readWikiEntry + cross-link -----
  console.log("\n=== readWikiEntry sample (first wiki entry with a prtsId) ===");
  // Walk a few known-shape wiki ids to find one with a prtsId.
  const sampleIds = [
    "wiki_eny_0018_lbtough",
    "wiki_eny_0021_agmelee",
    "wiki_eny_0007_mimicw",
  ];
  let shown = false;
  for (const id of sampleIds) {
    const entry = readWikiEntry(id);
    if (entry && entry.prtsId) {
      console.log(`entryId: ${entry.entryId}`);
      console.log(`group: ${entry.groupName} (${entry.groupId})`);
      console.log(`prtsId: ${entry.prtsId}`);
      // Follow the cross-link into the PRTS document.
      const linked = readLoreDocument(entry.prtsId);
      if (linked) {
        console.log(
          `  → linked doc: ${linked.title} (${linked.body.length} chars)`,
        );
      }
      shown = true;
      break;
    }
  }
  if (!shown) {
    console.log("(no sample wiki entry with prtsId found among probes)");
  }

  console.log("\n✓ v0.4.0 worldview tools smoke test complete.");
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
