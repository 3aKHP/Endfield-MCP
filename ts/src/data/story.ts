/**
 * Story data reader — catalog loading, chapter grouping, scene reading, search.
 *
 * Data layout (from endfield-story-CN.zip):
 *   index.json     — catalog of 9271 entries (fields: k/d/m/s/t/a/n/p/tags)
 *   missions.json  — mission id → display name map
 *   actors.json    — actor id → name variants (reader uses line-level `actor` first)
 *   search.json    — full-text index: array of {k, x} where x is concatenated text
 *   conv/<k>.json  — one file per scene: {key, kind, mission, scene, lines, optionGroups}
 *
 * ## Loading strategy
 *
 * The catalog (index/missions) loads eagerly into memory at first access
 * (~2.4MB). Individual conv files load on-demand by conv key (each tens
 * of KB). This mirrors PRTS-MCP's ZipStore pattern and keeps memory
 * bounded — we never hold all 97MB of dialogue in memory at once.
 *
 * ## Chapter derivation
 *
 * There is no explicit chapter list in the data. Chapters are derived
 * by grouping entries on the episode-prefix portion of the mission id:
 *   e1m1, e1m2 → chapter "e1"
 *   sm1l1m1    → chapter "sm1"
 *   c6m1       → chapter "c6" (character story)
 * Display names come from missions.json when available; the prefix is
 * used as fallback.
 */

import type { JsonStore } from "./stores.js";
import type {
  StoryChapter,
  StoryEntry,
  StoryLine,
  StoryScene,
} from "./storyTypes.js";

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

interface RawSearchEntry {
  k: string;
  x: string;
}

interface RawSearch {
  entries: RawSearchEntry[];
}

interface RawConvLine {
  id?: string;
  aid?: string;
  actor?: string;
  text?: string;
  hint?: string;
  // SNS variant fields
  speaker?: string;
  cid?: string;
  type?: string;
}

interface RawConvOption {
  id?: string;
  i?: number;
  text?: string;
  icon?: string;
}

interface RawConvOptionGroup {
  g?: number;
  options?: RawConvOption[];
}

interface RawConv {
  key: string;
  kind?: string;
  mission?: string;
  scene?: string | number;
  lines?: RawConvLine[];
  optionGroups?: RawConvOptionGroup[];
}

// ---------------------------------------------------------------------------
// Store binding + cache
// ---------------------------------------------------------------------------

let _store: JsonStore | null = null;
let _entries: StoryEntry[] | null = null;
let _missionNames: Record<string, string> | null = null;
let _searchIndex: RawSearchEntry[] | null = null;
let _chapterCache: Map<string, StoryEntry[]> | null = null;
let _entryMap: Map<string, StoryEntry> | null = null;

export function bindStoryStore(store: JsonStore): void {
  _store = store;
  clearStoryCaches();
}

export function clearStoryCaches(): void {
  _entries = null;
  _missionNames = null;
  _searchIndex = null;
  _chapterCache = null;
  _entryMap = null;
}

function store(): JsonStore {
  if (_store === null) {
    throw new Error(
      "Story reader used before bindStoryStore() — call it once at startup.",
    );
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Catalog loading
// ---------------------------------------------------------------------------

function entries(): StoryEntry[] {
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

function missionNames(): Record<string, string> {
  if (_missionNames !== null) return _missionNames;
  const raw = store().readJson<RawMissions>("missions.json");
  _missionNames = raw.missionNames ?? {};
  return _missionNames;
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
// Chapter derivation
// ---------------------------------------------------------------------------

/**
 * Extract the chapter prefix from a mission id.
 *
 * Mission ids follow patterns like:
 *   e1m1, e1m2      → "e1" (main story episode 1)
 *   e10m4           → "e10"
 *   sm1l1m1         → "sm1" (side mission layer 1)
 *   c6m1            → "c6" (character 6's story)
 *   gm01m1          → "gm01" (gate story)
 *   a1m6d2          → "a1" (activity)
 *   f1m1            → "f1" (facility)
 *
 * Strategy: take the leading non-digit run + the following digit run.
 * "e1m1" → "e1", "sm1l1m1" → "sm1", "gm01m1" → "gm01".
 */
function chapterPrefix(mission: string): string {
  const match = mission.match(/^([a-z]+)(\d+)/i);
  return match ? `${match[1]}${match[2]}` : mission;
}

function chaptersByPrefix(): Map<string, StoryEntry[]> {
  if (_chapterCache !== null) return _chapterCache;
  const map = new Map<string, StoryEntry[]>();
  for (const e of entries()) {
    const prefix = chapterPrefix(e.mission);
    const bucket = map.get(prefix);
    if (bucket) {
      bucket.push(e);
    } else {
      map.set(prefix, [e]);
    }
  }
  _chapterCache = map;
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all story chapters with scene counts and display names. */
export function listStoryChapters(): StoryChapter[] {
  const names = missionNames();
  const grouped = chaptersByPrefix();
  const out: StoryChapter[] = [];
  for (const [chapterId, sceneList] of grouped) {
    // Try to find a display name: look for any mission in this chapter
    // that has a name in missions.json, prefer the first one.
    let displayName = chapterId;
    for (const e of sceneList) {
      const name = names[e.mission];
      if (name) {
        displayName = name;
        break;
      }
    }
    out.push({
      chapterId,
      displayName,
      entryCount: sceneList.length,
    });
  }
  // Sort: main story first (e1, e2, ...), then by chapter id.
  out.sort((a, b) => {
    if (a.chapterId.startsWith("e") && !b.chapterId.startsWith("e")) return -1;
    if (!a.chapterId.startsWith("e") && b.chapterId.startsWith("e")) return 1;
    return a.chapterId.localeCompare(b.chapterId, undefined, { numeric: true });
  });
  return out;
}

/** List scenes within a chapter (by chapter prefix like "e1", "sm1"). */
export function listStories(chapterId: string): StoryEntry[] {
  const grouped = chaptersByPrefix();
  // Normalize: user might pass "e1" or "E1" — case-insensitive match.
  const lower = chapterId.toLowerCase();
  for (const [prefix, list] of grouped) {
    if (prefix.toLowerCase() === lower) {
      return [...list].sort((a, b) => {
        if (a.mission !== b.mission) {
          return a.mission.localeCompare(b.mission, undefined, { numeric: true });
        }
        return a.scene - b.scene;
      });
    }
  }
  return [];
}

/**
 * Load and parse one dialogue scene by conv key.
 *
 * Reads conv/<key>.json on-demand (does not cache — scenes are large
 * and infrequently re-read). Lines are normalized to the StoryLine
 * three-state shape. Player choices are extracted from optionGroups.
 */
export function readStory(convKey: string): StoryScene | null {
  const path = `conv/${convKey}.json`;
  if (!store().exists(path)) return null;

  // readJsonInt64Safe: conv line `id` fields are int64-sized in source
  // data. We don't currently surface line ids, but use the safe parser
  // defensively (matching characters.ts and texts.ts) so a future
  // enhancement that adds line ids doesn't silently truncate them.
  const raw = store().readJsonInt64Safe<RawConv>(path);
  const names = missionNames();
  const mission = raw.mission ?? "";
  const sceneNum = typeof raw.scene === "string"
    ? Number(raw.scene) || 0
    : raw.scene ?? 0;

  const lines: StoryLine[] = (raw.lines ?? []).map((line) =>
    normalizeLine(line),
  );

  const choices: Array<{ index: number; text: string }> = [];
  for (const group of raw.optionGroups ?? []) {
    for (const opt of group.options ?? []) {
      choices.push({
        index: opt.i ?? 0,
        text: opt.text ?? "",
      });
    }
  }

  return {
    key: convKey,
    mission,
    missionName: names[mission] ?? mission,
    scene: sceneNum,
    lines,
    choices,
  };
}

/** Normalize a raw conv line to the StoryLine three-state shape. */
function normalizeLine(line: RawConvLine): StoryLine {
  // SNS/chat variant: has `speaker` or `cid` instead of `actor`.
  if (line.speaker && line.text) {
    return {
      type: "dialog",
      role: line.speaker,
      text: line.text,
    };
  }

  // Standard dialog: has `actor` (resolved display name).
  if (line.actor && line.text) {
    return {
      type: "dialog",
      role: line.actor,
      text: line.text,
    };
  }

  // Narration: only `id` + `text`, no actor.
  if (line.text) {
    return {
      type: "narration",
      role: null,
      text: line.text,
    };
  }

  // Fallback (shouldn't happen in well-formed data).
  return {
    type: "narration",
    role: null,
    text: "",
  };
}

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

/** Check whether story data is available (catalog loaded). */
export function hasStoryData(): boolean {
  try {
    return store().exists("index.json");
  } catch {
    return false;
  }
}
