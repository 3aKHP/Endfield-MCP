/**
 * Story scene reader — load and parse one dialogue scene by conv key.
 *
 * Reads `conv/<key>.json` on-demand from the store. Scenes are not cached —
 * they are large and infrequently re-read, so we re-read per call rather
 * than hold 97MB of dialogue in memory. Lines are normalized to the
 * StoryLine three-state shape. Player choices are extracted from
 * optionGroups (a separate structure from the lines array).
 *
 * Depends on `./storyCore.js` for the store accessor and mission-name map.
 */

import type { StoryLine, StoryScene } from "./storyTypes.js";
import { store, missionNames } from "./storyCore.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes (conv file structure from upstream data)
// ---------------------------------------------------------------------------

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
// Line normalization
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
