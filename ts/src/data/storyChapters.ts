/**
 * Story chapter derivation and listing.
 *
 * There is no explicit chapter list in the upstream data. Chapters are
 * derived by grouping catalog entries on the episode-prefix portion of
 * the mission id:
 *   e1m1, e1m2 → chapter "e1"
 *   sm1l1m1    → chapter "sm1"
 *   c6m1       → chapter "c6" (character story)
 * Display names come from missions.json when available; the prefix is
 * used as fallback.
 *
 * Depends on `./storyCore.js` for the catalog loaders (`entries`,
 * `missionNames`).
 */

import type { StoryChapter, StoryEntry } from "./storyTypes.js";
import { entries, missionNames } from "./storyCore.js";

// ---------------------------------------------------------------------------
// Chapter cache (private to this module)
// ---------------------------------------------------------------------------

let _chapterCache: Map<string, StoryEntry[]> | null = null;

/** Reset the chapter grouping cache. Called by the barrel orchestrator. */
export function clearChapterCache(): void {
  _chapterCache = null;
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
