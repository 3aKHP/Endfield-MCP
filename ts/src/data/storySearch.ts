/**
 * Story full-text search.
 *
 * Uses the pre-built `search.json` index (concatenated text per scene) to
 * answer regex queries across all 9271 dialogue scenes without loading
 * each conv file. Returns matching entries with the conv key and a
 * snippet around the match.
 *
 * Depends on `./storyCore.js` for the store accessor and catalog entries.
 */

import type { StoryEntry } from "./storyTypes.js";
import { store, entries } from "./storyCore.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes (search.json structure)
// ---------------------------------------------------------------------------

interface RawSearchEntry {
  k: string;
  x: string;
}

interface RawSearch {
  entries: RawSearchEntry[];
}

// ---------------------------------------------------------------------------
// Search caches (private to this module)
// ---------------------------------------------------------------------------

let _searchIndex: RawSearchEntry[] | null = null;
let _entryMap: Map<string, StoryEntry> | null = null;

/** Reset the search caches. Called by the barrel orchestrator. */
export function clearSearchCache(): void {
  _searchIndex = null;
  _entryMap = null;
}

function searchIndex(): RawSearchEntry[] {
  if (_searchIndex !== null) return _searchIndex;
  try {
    const raw = store().readJson<RawSearch>("search.json");
    _searchIndex = raw.entries ?? [];
  } catch {
    // search.json is optional — if missing, search returns empty.
    _searchIndex = [];
  }
  return _searchIndex;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full-text search across all dialogue scenes.
 *
 * Uses the pre-built search.json index (concatenated text per scene).
 * Returns matching entries with the conv key and a snippet around the
 * match.
 */
export function searchStories(
  pattern: string,
  maxResults = 30,
): Array<{ key: string; snippet: string; entry: StoryEntry }> {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(literal, "i");
  }

  const idx = searchIndex();
  // Build key→entry lookup lazily and cache it (9271 entries — pointless
  // to rebuild on every search call since the catalog only changes on
  // sync, which clears this cache via clearStoryCaches).
  if (_entryMap === null) {
    _entryMap = new Map<string, StoryEntry>();
    for (const e of entries()) _entryMap.set(e.key, e);
  }
  const entryMap = _entryMap;

  const out: Array<{ key: string; snippet: string; entry: StoryEntry }> = [];
  for (const se of idx) {
    if (re.test(se.x)) {
      const entry = entryMap.get(se.k);
      if (entry) {
        // Extract a snippet around the first match.
        const matchIdx = se.x.search(re);
        const start = Math.max(0, matchIdx - 30);
        const end = Math.min(se.x.length, matchIdx + 80);
        const snippet = (start > 0 ? "..." : "") +
          se.x.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < se.x.length ? "..." : "");
        out.push({ key: se.k, snippet, entry });
        if (out.length >= maxResults) break;
      }
    }
  }
  return out;
}
