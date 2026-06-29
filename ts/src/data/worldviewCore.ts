/**
 * Worldview reader core — store binding, RichContent bridge, catalog loading.
 *
 * This module is the shared spine of the worldview (PRTS archive + in-game
 * wiki) domain, mirroring `storyCore.ts`'s role in the story domain. It owns
 * the JsonStore reference, the RichContentTable bridge cache, and the
 * eager-loaded catalog caches (categories, first-level groups, wiki
 * structure). The categories/documents/search sub-modules import the lazy
 * loaders exported here.
 *
 * ## The RichContent bridge (the one worldview-specific capability)
 *
 * Unlike the tables domain (where `{id, text}` carries a direct int64 hash),
 * PRTS documents carry a **string `contentId`** (e.g. "text_v0d8_10"). That
 * key indexes RichContentTable.json, whose entry is a titled list of content
 * segments:
 *
 *   `RichContentTable[contentId]` = `{ title: {id, text}, contentList: [{content: {id, text}}, ...] }`
 *
 * Each segment's `content.id` is an int64 hash resolved through i18n.
 * `resolveContent(contentId)` walks that structure and concatenates the
 * resolved segments into one body string (image tags like `<image>...</image>`
 * are passed through verbatim — the caller decides whether to render them).
 *
 * This keeps `texts.ts` hash-only (its design contract) while giving the
 * worldview domain a contentId resolver. The bridge is local to this module.
 *
 * ## Loading strategy
 *
 * Catalogs (categories / firstLv / wiki categories+groups) load eagerly on
 * first access — together they are <1.5MB. The RichContentTable (~390KB,
 * 586 entries) also loads eagerly because document bodies and the search
 * index both need it. All parsed once and cached for the process lifetime;
 * invalidated together on sync refresh via `clearWorldviewCatalogCaches()`.
 *
 * ## Cache lifecycle
 *
 * This module owns the RichContent + catalog caches. `clearWorldviewCatalogCaches()`
 * resets just those. The full-domain orchestrators (`bindWorldviewStore`,
 * `clearWorldviewCaches`) live in `./worldview.ts` (the barrel facade) so
 * they can clear sibling caches atomically without this module reaching into
 * its siblings (preserving one-directional layering).
 */

import type { JsonStore } from "./stores.js";
import type { LocalizedText } from "./texts.js";
import { resolveText as _resolveText } from "./texts.js";
import type {
  PrtsCategory,
  PrtsFirstLvGroup,
  PrtsItem,
  WikiCategory,
  WikiGroup,
} from "./worldviewTypes.js";

// ---------------------------------------------------------------------------
// Raw JSON shapes (from the mirror bundle)
// ---------------------------------------------------------------------------

/** One segment of a RichContent entry — its text, keyed by an int64 hash. */
interface RawRichContentSegment {
  content: LocalizedText;
}

/** A RichContentTable entry — a titled list of content segments. */
interface RawRichContentEntry {
  title?: LocalizedText;
  contentList?: RawRichContentSegment[];
}

/** RichContentTable.json top-level: `{ [contentId]: {title, contentList} }`. */
type RawRichContentTable = Record<string, RawRichContentEntry>;

/** PrtsCategory.json: `{ [categoryId]: entry }`. */
type RawPrtsCategoryTable = Record<string, PrtsCategory>;

/** PrtsFirstLv.json: `{ [firstLvId]: entry }`. */
type RawPrtsFirstLvTable = Record<string, PrtsFirstLvGroup>;

/** PrtsAllItem.json: `{ [itemId]: entry }`. */
type RawPrtsItemTable = Record<string, PrtsItem>;

/** WikiCategoryTable.json: `{ [categoryId]: entry }`. */
type RawWikiCategoryTable = Record<string, WikiCategory>;

/** WikiGroupTable.json: `{ [categoryId]: { list: WikiGroup[] } }`. */
interface RawWikiGroupTable {
  [categoryId: string]: { list: WikiGroup[] };
}

// ---------------------------------------------------------------------------
// Store reference + catalog caches (module-level singletons)
// ---------------------------------------------------------------------------

let _store: JsonStore | null = null;
let _richContent: Map<string, RawRichContentEntry> | null = null;
let _prtsCategories: PrtsCategory[] | null = null;
let _firstLvGroups: PrtsFirstLvGroup[] | null = null;
let _allItems: Map<string, PrtsItem> | null = null;
let _wikiCategories: WikiCategory[] | null = null;
let _wikiGroups: Map<string, WikiGroup[]> | null = null;

/**
 * Wire the JsonStore. Called once at startup by the barrel's
 * `bindWorldviewStore` orchestrator, which also clears all sibling caches.
 */
export function setWorldviewStore(store: JsonStore): void {
  _store = store;
}

/** Reset only the caches owned by this module (RichContent + catalogs). */
export function clearWorldviewCatalogCaches(): void {
  _richContent = null;
  _prtsCategories = null;
  _firstLvGroups = null;
  _allItems = null;
  _wikiCategories = null;
  _wikiGroups = null;
}

/** Whether the worldview bundle is present in the bound store. */
export function hasWorldviewData(): boolean {
  try {
    return store().exists("RichContentTable.json");
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
      "Worldview reader used before bindWorldviewStore() — call it once at startup.",
    );
  }
  return _store;
}

/**
 * The RichContentTable as a `Map<string, RawRichContentEntry>`.
 *
 * Loaded eagerly and cached. Built with `readJsonInt64Safe` because the
 * `id` values in title/content are int64 hashes stored as numeric literals
 * upstream (plain readJson would truncate them — the same hazard texts.ts
 * guards against).
 */
export function richContentTable(): Map<string, RawRichContentEntry> {
  if (_richContent !== null) return _richContent;
  const raw = store().readJsonInt64Safe<RawRichContentTable>(
    "RichContentTable.json",
  );
  const map = new Map<string, RawRichContentEntry>();
  for (const [key, entry] of Object.entries(raw)) {
    if (entry !== null && entry !== undefined) {
      map.set(key, entry);
    }
  }
  _richContent = map;
  return _richContent;
}

/** PRTS categories, sorted by `order`. */
export function prtsCategories(): PrtsCategory[] {
  if (_prtsCategories !== null) return _prtsCategories;
  const raw = store().readJsonInt64Safe<RawPrtsCategoryTable>(
    "prts/PrtsCategory.json",
  );
  _prtsCategories = Object.values(raw)
    .filter((c): c is PrtsCategory => c !== null && c !== undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return _prtsCategories;
}

/** First-level groups, sorted by `order`. */
export function firstLvGroups(): PrtsFirstLvGroup[] {
  if (_firstLvGroups !== null) return _firstLvGroups;
  const raw = store().readJsonInt64Safe<RawPrtsFirstLvTable>(
    "prts/PrtsFirstLv.json",
  );
  _firstLvGroups = Object.values(raw)
    .filter((g): g is PrtsFirstLvGroup => g !== null && g !== undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return _firstLvGroups;
}

/**
 * All PRTS narrative items, keyed by id.
 *
 * Built as a Map because both document reads and search look items up by id
 * repeatedly — an O(1) lookup beats a linear scan over 414 entries each time.
 */
export function allItems(): Map<string, PrtsItem> {
  if (_allItems !== null) return _allItems;
  const raw = store().readJsonInt64Safe<RawPrtsItemTable>(
    "prts/PrtsAllItem.json",
  );
  const map = new Map<string, PrtsItem>();
  for (const [id, item] of Object.entries(raw)) {
    if (item !== null && item !== undefined) {
      map.set(id, item);
    }
  }
  _allItems = map;
  return _allItems;
}

/** Wiki categories, sorted by `categoryPriority` (lower first). */
export function wikiCategories(): WikiCategory[] {
  if (_wikiCategories !== null) return _wikiCategories;
  const raw = store().readJsonInt64Safe<RawWikiCategoryTable>(
    "wiki/WikiCategoryTable.json",
  );
  _wikiCategories = Object.values(raw)
    .filter((c): c is WikiCategory => c !== null && c !== undefined)
    .sort((a, b) => (a.categoryPriority ?? 0) - (b.categoryPriority ?? 0));
  return _wikiCategories;
}

/** Wiki groups keyed by category id. */
export function wikiGroups(): Map<string, WikiGroup[]> {
  if (_wikiGroups !== null) return _wikiGroups;
  const raw = store().readJsonInt64Safe<RawWikiGroupTable>(
    "wiki/WikiGroupTable.json",
  );
  const map = new Map<string, WikiGroup[]>();
  for (const [categoryId, bucket] of Object.entries(raw)) {
    if (bucket && Array.isArray(bucket.list)) {
      map.set(categoryId, bucket.list);
    }
  }
  _wikiGroups = map;
  return _wikiGroups;
}

// ---------------------------------------------------------------------------
// Content resolution — the RichContent bridge
// ---------------------------------------------------------------------------

/**
 * Resolve a PRTS item's body text via its `contentId` string key.
 *
 * Walks the RichContent entry: resolves each `contentList` segment's int64
 * hash through i18n and joins them with newlines. The entry's `title` is
 * intentionally NOT included here — the item's own `name` field already
 * carries the title (resolved separately by callers), so folding it in would
 * duplicate it.
 *
 * Returns the concatenated body, or `""` when the contentId is missing/empty
 * or has no resolvable segments (some items — e.g. multimedia with no
 * transcript — legitimately have none).
 */
export function resolveContent(contentId: string | undefined): string {
  if (!contentId || contentId.length === 0) return "";
  const entry = richContentTable().get(contentId);
  if (entry === undefined || !entry.contentList) return "";
  const parts: string[] = [];
  for (const segment of entry.contentList) {
    const text = _resolveText(segment.content);
    if (text.length > 0) parts.push(text);
  }
  return parts.join("\n");
}

