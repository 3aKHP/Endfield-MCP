/**
 * Story domain — public facade and lifecycle orchestration.
 *
 * This file is a thin re-export barrel over the four sub-modules:
 *   - `./storyCore.js`     — store binding, catalog loading (index/missions)
 *   - `./storyChapters.js` — chapter derivation and listing
 *   - `./storyScenes.js`   — single-scene reading
 *   - `./storySearch.js`   — full-text search
 *
 * All consumers (tools, server, startupSync, smoke scripts) import from
 * `./story.js`, so the split is invisible to them — no call site changes.
 *
 * ## Lifecycle orchestration
 *
 * `bindStoryStore` and `clearStoryCaches` live here rather than in
 * `storyCore` because they must reset caches scattered across all four
 * sub-modules. Keeping the orchestrator in the barrel means `storyCore`
 * does not import its siblings, preserving a clean one-directional
 * dependency: barrel → core/chapters/scenes/search; chapters/scenes/search
 * → core.
 *
 * The atomic-reset contract is load-bearing: `startupSync.ts` calls
 * `clearStoryCaches()` after a sync that may replace any of `index.json`,
 * `missions.json`, `search.json`, so every cache must be invalidated
 * together.
 */

import type { JsonStore } from "./stores.js";
import { setStoryStore, clearStoryCatalogCaches } from "./storyCore.js";
import { clearChapterCache } from "./storyChapters.js";
import { clearSearchCache } from "./storySearch.js";

// ---------------------------------------------------------------------------
// Lifecycle orchestrators
// ---------------------------------------------------------------------------

/**
 * Wire the JsonStore and atomically reset every story-domain cache.
 *
 * Called once at startup (`server.ts`) and from smoke scripts. After this
 * returns, the next catalog/search access re-reads from the new store.
 */
export function bindStoryStore(store: JsonStore): void {
  setStoryStore(store);
  clearStoryCaches();
}

/**
 * Reset every cache in the story domain (catalog, chapters, search).
 *
 * Called after a mirror sync replaces any story data file. The order does
 * not matter — all caches become stale together — but we clear core last
 * for readability (core holds the foundation the others build on).
 */
export function clearStoryCaches(): void {
  clearStoryCatalogCaches();
  clearChapterCache();
  clearSearchCache();
}

// ---------------------------------------------------------------------------
// Public API re-exports (the domain's import surface, unchanged by the split)
// ---------------------------------------------------------------------------

export { hasStoryData } from "./storyCore.js";
export { listStoryChapters, listStories } from "./storyChapters.js";
export { readStory } from "./storyScenes.js";
export { searchStories } from "./storySearch.js";
