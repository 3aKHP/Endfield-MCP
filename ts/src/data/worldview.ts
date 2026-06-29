/**
 * Worldview domain — public facade and lifecycle orchestration.
 *
 * Thin re-export barrel over the four sub-modules:
 *   - `./worldviewCore.js`       — store binding, TextTable bridge, catalog loading
 *   - `./worldviewCategories.js` — PRTS category / wiki category listing
 *   - `./worldviewDocuments.js`  — single-item reads + wiki entry reads
 *   - `./worldviewSearch.js`     — full-text search
 *
 * All consumers (tools, server, startupSync, smoke scripts) import from
 * `./worldview.js`, so the split is invisible to them — same pattern as the
 * story domain's `story.ts`.
 *
 * ## Lifecycle orchestration
 *
 * `bindWorldviewStore` and `clearWorldviewCaches` live here rather than in
 * `worldviewCore` because they must reset caches scattered across all four
 * sub-modules. Keeping the orchestrator in the barrel means `worldviewCore`
 * does not import its siblings, preserving a clean one-directional
 * dependency: barrel → core/categories/documents/search; the latter three
 * → core.
 *
 * The atomic-reset contract is load-bearing: `startupSync.ts` calls
 * `clearWorldviewCaches()` after a sync that may replace any worldview file,
 * so every cache must be invalidated together.
 */

import type { JsonStore } from "./stores.js";
import {
  setWorldviewStore,
  clearWorldviewCatalogCaches,
} from "./worldviewCore.js";
import { clearDocumentCaches } from "./worldviewDocuments.js";
import { clearWorldviewSearchCache } from "./worldviewSearch.js";

// ---------------------------------------------------------------------------
// Lifecycle orchestrators
// ---------------------------------------------------------------------------

/**
 * Wire the JsonStore and atomically reset every worldview-domain cache.
 *
 * Called once at startup (`server.ts`) and from smoke scripts. After this
 * returns, the next catalog/search/document access re-reads from the new store.
 */
export function bindWorldviewStore(store: JsonStore): void {
  setWorldviewStore(store);
  clearWorldviewCaches();
}

/**
 * Reset every cache in the worldview domain.
 *
 * Called after a mirror sync replaces any worldview data file. The order does
 * not matter — all caches become stale together — but we clear core last for
 * readability (core holds the foundation the others build on).
 */
export function clearWorldviewCaches(): void {
  clearDocumentCaches();
  clearWorldviewSearchCache();
  clearWorldviewCatalogCaches();
}

// ---------------------------------------------------------------------------
// Public API re-exports (the domain's import surface)
// ---------------------------------------------------------------------------

export { hasWorldviewData } from "./worldviewCore.js";
export {
  listLoreCategories,
  listLoreGroups,
  listWikiCategories,
  listWikiGroups,
} from "./worldviewCategories.js";
export {
  readLoreDocument,
  listItemsByGroup,
  readWikiEntry,
  wikiEntriesForPrts,
} from "./worldviewDocuments.js";
export { searchWorldview } from "./worldviewSearch.js";
