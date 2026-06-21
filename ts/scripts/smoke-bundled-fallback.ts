/**
 * Bundled-fallback smoke test.
 *
 * Simulates the "no network, only bundled data" scenario: points
 * EF_DATA_PATH at a nonexistent synced directory, then verifies the
 * server's FallbackStore transparently serves reads from the bundled
 * snapshot (ts/data/endfield/).
 *
 * This mirrors what an npm-installed EndField-MCP experiences on first
 * run with no network: the bundled snapshot ships in the package, so
 * GameData tools work immediately, then auto-sync refreshes in the
 * background when network becomes available.
 *
 * Prerequisite: ts/data/endfield/ must be populated (run
 *   bun run scripts/fetch-bundled-data.ts first).
 *
 * Run:
 *   bun run ts/scripts/smoke-bundled-fallback.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DirectoryStore, FallbackStore, type JsonStore } from "../src/data/stores.js";
import { bindTextStore } from "../src/data/texts.js";
import {
  bindCharacterStore,
  clearCharacterCaches,
  getCharacterInfo,
  listCharacters,
} from "../src/data/characters.js";

const _tsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundledPath = join(_tsRoot, "data", "endfield");

console.log("=== bundled-fallback smoke test ===");
console.log(`bundled path: ${bundledPath}`);

if (!existsSync(join(bundledPath, "tables", "CharacterTable.json"))) {
  console.error(
    "PRECONDITION FAILED: bundled data not populated. Run:\n" +
      "  bun run scripts/fetch-bundled-data.ts",
  );
  process.exit(1);
}

// Synced dir intentionally points at a nonexistent path — simulates
// "first run, no network, auto-sync hasn't run yet".
const fakeSynced = mkdtempSync(join(tmpdir(), "ef-empty-synced-"));
console.log(`synced path (empty): ${fakeSynced}`);
console.log("");

// Build the exact FallbackStore the server would build.
const store: JsonStore = new FallbackStore(
  new DirectoryStore(fakeSynced),
  new DirectoryStore(bundledPath),
);
console.log(`store describe: ${store.describe()}`);
console.log("");

bindTextStore(store);
bindCharacterStore(store);
clearCharacterCaches();

console.log("=== listCharacters() via bundled fallback ===");
const list = listCharacters("CN");
console.log(`returned ${list.length} characters:`);
for (const c of list.slice(0, 3)) {
  console.log(`  ${c.id}  ${c.name}  ${c.profession}  ${c.rarity}★`);
}
console.log(`  ... (${list.length} total)`);

console.log("\n=== getCharacterInfo('chr_0002_endminm') via bundled ===");
const info = getCharacterInfo("chr_0002_endminm", "CN");
if (info === null) {
  console.error("FAILED: could not load character from bundled data.");
  rmSync(fakeSynced, { recursive: true, force: true });
  process.exit(1);
}
console.log(`  name: ${info.name} (${info.engName})`);
console.log(`  profession: ${info.profession}, rarity: ${info.rarity}★`);
console.log(`  CV chinese: ${info.cvNames.chinese || "(none)"}`);

console.log(
  "\n=== verify primary (synced) miss is transparent ===",
);
const syncedStore = new DirectoryStore(fakeSynced);
console.log(
  `  synced has CharacterTable.json? ${syncedStore.exists("tables/CharacterTable.json")}`,
);
console.log(
  `  fallback chain serves it?      ${store.exists("tables/CharacterTable.json")}`,
);

console.log("\n✓ Bundled fallback smoke test passed.");
rmSync(fakeSynced, { recursive: true, force: true });
