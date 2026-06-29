/**
 * Worldview document reading — single PRTS item and wiki entry reads.
 *
 * The "read" half of the worldview domain, mirroring `storyScenes.ts`'s role:
 * turn a content id into a fully-resolved, human-readable document. This is
 * where the TextTable bridge gets exercised — `resolveContent()` walks
 * contentId → TextTable → i18n to produce the body text.
 *
 * Depends on `./worldviewCore.js` for catalog loaders and content resolution.
 */

import { resolveText } from "./texts.js";
import {
  allItems,
  firstLvGroups,
  resolveContent,
  store,
  wikiGroups,
} from "./worldviewCore.js";
import type { PrtsItem } from "./worldviewTypes.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes read on-demand (not eager-cached)
// ---------------------------------------------------------------------------

/** WikiEntryDataTable.json: `{ [id]: entry }`. */
type RawWikiEntryDataTable = Record<string, WikiEntryDataLike>;

/** Minimal wiki entry shape (loose by design — auxiliary context). */
interface WikiEntryDataLike {
  id: string;
  groupId: string;
  prtsId?: string;
  desc?: { id: string; text: string };
  order: number;
  refItemId?: string;
  refMonsterTemplateId?: string;
}

// ---------------------------------------------------------------------------
// Public view types
// ---------------------------------------------------------------------------

/** A fully-resolved PRTS document, ready for tool output. */
export interface LoreDocumentView {
  itemId: string;
  /** Resolved display title. */
  title: string;
  /** Resolved body text (may be "" for multimedia without transcripts). */
  body: string;
  /** Content kind: document / record / multi_media / text. */
  type: string;
  /** Owning first-level group id. */
  firstLvId: string;
  /** Owning category id (derived via the group). */
  categoryId: string;
  order: number;
  /** Resolved description, or "" if absent. */
  description: string;
}

/** A fully-resolved wiki entry, ready for tool output. */
export interface WikiEntryView {
  entryId: string;
  /** Owning group id. */
  groupId: string;
  /** Resolved group display name (looked up via the category→group tree). */
  groupName: string;
  /** Associated PRTS document id (the lore cross-link), if any. */
  prtsId: string | null;
  order: number;
  /** Resolved description, or "" if absent. */
  description: string;
  /** Reference into ItemTable (mechanics; surfaced verbatim, not resolved). */
  refItemId: string | null;
  /** Reference into EnemyTemplateTable (mechanics; surfaced verbatim). */
  refMonsterTemplateId: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a firstLvId → categoryId index lazily (private to this module). */
let _firstLvCategory: Map<string, string> | null = null;

function firstLvCategoryIndex(): Map<string, string> {
  if (_firstLvCategory !== null) return _firstLvCategory;
  const map = new Map<string, string>();
  for (const g of firstLvGroups()) {
    map.set(g.firstLvId, g.categoryId);
  }
  _firstLvCategory = map;
  return map;
}

/** Reset the private caches. Called by the barrel orchestrator on sync. */
export function clearDocumentCaches(): void {
  _firstLvCategory = null;
  _wikiEntryData = null;
}

function toView(item: PrtsItem): LoreDocumentView {
  return {
    itemId: item.id,
    title: resolveText(item.name, undefined, item.id),
    body: resolveContent(item.contentId),
    type: item.type,
    firstLvId: item.firstLvId,
    categoryId: firstLvCategoryIndex().get(item.firstLvId) ?? "",
    order: item.order,
    // id === 0 is upstream's "no description" marker — treat as empty.
    description: isEmptyLoc(item.desc) ? "" : resolveText(item.desc),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a single PRTS narrative item by id.
 *
 * Returns `null` when the id is unknown. The body text is resolved through
 * the TextTable bridge (contentId → hash → i18n).
 */
export function readLoreDocument(itemId: string): LoreDocumentView | null {
  const item = allItems().get(itemId);
  if (item === undefined) return null;
  return toView(item);
}

/**
 * List the narrative items belonging to a first-level group.
 *
 * Items are returned in their upstream `order`. Useful for browsing a
 * multi-document group in sequence.
 */
export function listItemsByGroup(firstLvId: string): LoreDocumentView[] {
  const lower = firstLvId.toLowerCase();
  const group = firstLvGroups().find(
    (g) => g.firstLvId.toLowerCase() === lower,
  );
  if (!group) return [];
  const items = group.itemIds
    .map((id) => allItems().get(id))
    .filter((item): item is PrtsItem => item !== undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map(toView);
}

/**
 * Read a wiki entry by id, with its group name resolved.
 *
 * Returns `null` when the id is unknown. The `prtsId` cross-link is surfaced
 * verbatim so the caller can feed it to `ef_read_lore_document` for the
 * associated lore text.
 */
export function readWikiEntry(entryId: string): WikiEntryView | null {
  const raw = readWikiEntryData();
  const entry = raw.get(entryId);
  if (entry === undefined) return null;

  // Resolve group name by scanning the category→group tree once.
  let groupName = entry.groupId;
  for (const [, groups] of wikiGroups()) {
    const found = groups.find((g) => g.groupId === entry.groupId);
    if (found) {
      groupName = resolveText(found.groupName, undefined, found.groupId);
      break;
    }
  }

  return {
    entryId: entry.id,
    groupId: entry.groupId,
    groupName,
    prtsId: entry.prtsId && entry.prtsId.length > 0 ? entry.prtsId : null,
    order: entry.order,
    // id === 0 is upstream's "no description" marker — treat as empty rather
    // than letting resolveText return the literal "0" as a fallback.
    description: isEmptyLoc(entry.desc) ? "" : resolveText(entry.desc),
    refItemId: entry.refItemId && entry.refItemId.length > 0 ? entry.refItemId : null,
    refMonsterTemplateId:
      entry.refMonsterTemplateId && entry.refMonsterTemplateId.length > 0
        ? entry.refMonsterTemplateId
        : null,
  };
}

/**
 * True when a LocalizedText is the upstream "absent" marker ({id:0, text:""}).
 *
 * `id` is coerced via `String()` because readJsonInt64Safe leaves small ids
 * (≤2^53) as bare JSON numbers, so `desc.id` can arrive as the number `0`
 * rather than the string `"0"`. A strict `=== "0"` would miss the numeric
 * form — the same int64/coercion trap STYLE.md's "已知陷阱" warns about.
 */
function isEmptyLoc(loc: { id: string | number; text: string } | undefined): boolean {
  if (!loc) return true;
  return loc.text === "" && (String(loc.id) === "0" || loc.id === "");
}

/**
 * Reverse-lookup: which wiki entries point at a given PRTS document?
 *
 * Used by `ef_read_lore_document` to surface "this document is referenced by
 * these wiki entries". Returns entry ids only (the caller can expand them
 * via `readWikiEntry` if needed).
 */
export function wikiEntriesForPrts(prtsId: string): string[] {
  const raw = readWikiEntryData();
  const out: string[] = [];
  for (const [entryId, entry] of raw) {
    if (entry.prtsId && entry.prtsId === prtsId) {
      out.push(entryId);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// On-demand table reads (cached privately)
// ---------------------------------------------------------------------------

let _wikiEntryData: Map<string, WikiEntryDataLike> | null = null;

function readWikiEntryData(): Map<string, WikiEntryDataLike> {
  if (_wikiEntryData !== null) return _wikiEntryData;
  const raw = store().readJsonInt64Safe<RawWikiEntryDataTable>(
    "wiki/WikiEntryDataTable.json",
  );
  const map = new Map<string, WikiEntryDataLike>();
  for (const [id, entry] of Object.entries(raw)) {
    if (entry !== null && entry !== undefined) {
      map.set(id, entry);
    }
  }
  _wikiEntryData = map;
  return map;
}
