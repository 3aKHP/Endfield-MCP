/**
 * Story reader core — store binding and catalog loading.
 *
 * This module is the shared spine of the story domain. It owns the JsonStore
 * reference and the two eager-loaded catalog caches (`index.json`,
 * `missions.json`). The chapter, scene, and search sub-modules import the
 * lazy loaders exported here so the catalog is parsed exactly once across
 * the whole domain.
 *
 * ## Loading strategy
 *
 * The catalog (index/missions) loads eagerly into memory at first access
 * (~2.4MB). Individual conv files load on-demand by conv key (each tens
 * of KB). This mirrors PRTS-MCP's ZipStore pattern and keeps memory
 * bounded — we never hold all 97MB of dialogue in memory at once.
 *
 * ## Cache lifecycle
 *
 * This module only owns the catalog caches. `clearStoryCatalogCaches()`
 * resets just those. The full-domain orchestrators (`bindStoryStore`,
 * `clearStoryCaches`) live in `./story.ts` (the barrel facade) so they
 * can clear sibling caches atomically without this module reaching into
 * its siblings (which would muddy the layering).
 */

import type { JsonStore } from "./stores.js";
import type { StoryEntry } from "./storyTypes.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes (from upstream data)
// ---------------------------------------------------------------------------

interface RawIndexEntry {
  k: string;
  d: string;
  m: string;
  s: number;
  t: string;
  a: number;
  c?: string[];
  n: number;
  p: string;
  tags?: string[];
}

interface RawIndex {
  entries: RawIndexEntry[];
}

interface RawMissions {
  missionNames: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Store reference + catalog cache (module-level singletons)
// ---------------------------------------------------------------------------

let _store: JsonStore | null = null;
let _entries: StoryEntry[] | null = null;
let _missionNames: Record<string, string> | null = null;

/**
 * Wire the JsonStore. Called once at startup by the barrel's
 * `bindStoryStore` orchestrator, which also clears all sibling caches.
 */
export function setStoryStore(store: JsonStore): void {
  _store = store;
}

/** Reset only the catalog caches owned by this module. */
export function clearStoryCatalogCaches(): void {
  _entries = null;
  _missionNames = null;
}

export function hasStoryData(): boolean {
  try {
    return store().exists("index.json");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal accessors — exported for sibling modules (same domain, same layer)
// ---------------------------------------------------------------------------

export function store(): JsonStore {
  if (_store === null) {
    throw new Error(
      "Story reader used before bindStoryStore() — call it once at startup.",
    );
  }
  return _store;
}

export function entries(): StoryEntry[] {
  if (_entries !== null) return _entries;
  const raw = store().readJson<RawIndex>("index.json");
  _entries = (raw.entries ?? []).map((e) => ({
    key: e.k,
    domain: e.d,
    mission: e.m,
    scene: e.s,
    type: e.t,
    actorCount: e.a,
    lineCount: e.n,
    preview: e.p,
    tags: e.tags ?? [],
  }));
  return _entries;
}

export function missionNames(): Record<string, string> {
  if (_missionNames !== null) return _missionNames;
  const raw = store().readJson<RawMissions>("missions.json");
  _missionNames = raw.missionNames ?? {};
  return _missionNames;
}
