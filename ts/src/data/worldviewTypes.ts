/**
 * Worldview data types — shared between the lore/wiki reader and its tools.
 *
 * Mirrors the in-game PRTS archive system and the in-game encyclopedia as
 * shipped in `endfield-worldview.zip` (v0.4 mirror). All tables are
 * `{id: entry}` dicts at the top level — same shape as CharacterTable.json.
 *
 * ## Localized text convention
 *
 * Every human-readable field is a {@link LocalizedText} (`{id, text}` where
 * `text` is empty upstream and the real string lives in i18n keyed by `id`).
 * These resolve through `texts.ts:resolveText()` exactly like character
 * fields do.
 *
 * ## The contentId string-key indirection
 *
 * PRTS document/record/multimedia entries carry a `contentId` that is a
 * **string key** (e.g. `"text_v0d8_10"`), NOT a direct int64 hash. The body
 * text is resolved through RichContentTable.json, whose entry is a titled
 * list of content segments:
 *
 *   `RichContentTable[contentId]` = `{ title: {id, text}, contentList: [{content: {id, text}}, ...] }`
 *
 * Each segment's `content.id` is an int64 hash looked up in i18n/CN.json
 * (shipped in the v0.2.0 tables bundle). `worldviewCore.resolveContent()`
 * concatenates the resolved segments into the body string.
 *
 * This is the one place the worldview domain extends beyond the existing
 * text pipeline; it lives in `worldviewCore.ts` so it does not leak into
 * `texts.ts` (which is hash-only by design).
 *
 * ## Wiki ↔ Prts cross-link
 *
 * `WikiEntryData.prtsId` points into a `PrtsDocument` id — each in-game
 * encyclopedia entry (monster/item/etc.) has an associated lore document.
 * `ef_get_wiki_entry` follows this link.
 */

import type { LocalizedText } from "./texts.js";

// ---------------------------------------------------------------------------
// PRTS archive
// ---------------------------------------------------------------------------

/**
 * A top-level PRTS category (one of the archive's main tabs).
 *
 * PrtsCategory.json shape: `{ [categoryId]: PrtsCategory }`.
 * Observed ids: collection, digital, document, media, paper, report.
 */
export interface PrtsCategory {
  /** Stable category id, e.g. "collection", "document". */
  categoryId: string;
  /** Display name (resolved via i18n). */
  name: LocalizedText;
  /** Sort order within the category list. */
  order: number;
  /** Tab icon asset id (unused by the MCP; passed through for completeness). */
  tabIcon?: string;
}

/**
 * An entry-point page type inside the PRTS archive.
 *
 * PrtsPage.json shape: `{ [pageType]: PrtsPage }`.
 * Observed types: document, multi_media, text.
 */
export interface PrtsPage {
  /** Page type id, e.g. "document", "multi_media". */
  pageType: string;
  name: LocalizedText;
  icon?: string;
}

/**
 * A first-level group: a titled container holding one or more narrative
 * items (the unit a player opens to read a document).
 *
 * PrtsFirstLv.json shape: `{ [firstLvId]: PrtsFirstLvGroup }`.
 * `itemIds` reference entries in PrtsAllItem (and the typed subsets
 * PrtsDocument/PrtsRecord/PrtsMultimedia, which share PrtsItem's shape).
 */
export interface PrtsFirstLvGroup {
  /** Group id, e.g. "collection_e1m7_1". */
  firstLvId: string;
  /** Owning category id (foreign key into PrtsCategory). */
  categoryId: string;
  name: LocalizedText;
  /** Optional subtitle (often empty `{id:0, text:""}`). */
  subName?: LocalizedText;
  /** Sort order within the category. */
  order: number;
  icon?: string;
  /** Narrative item ids belonging to this group (foreign keys into PrtsAllItem). */
  itemIds: string[];
}

/**
 * A single narrative item — the leaf content unit of the PRTS archive.
 *
 * This shape is shared by PrtsAllItem (the union), PrtsDocument, PrtsRecord,
 * and PrtsMultimedia (typed subsets selected by `type`). The body text is
 * reached via `contentId` → TextTable → i18n (see module docstring).
 *
 * PrtsAllItem.json shape: `{ [itemId]: PrtsItem }`.
 * `type` observed values: "document", "record", "multi_media", "text".
 */
export interface PrtsItem {
  /** Item id, e.g. "nar_document_v0d8_10_1". */
  id: string;
  /** String key into TextTable.json — resolves to the body text. */
  contentId?: string;
  /** Group this item belongs to (foreign key into PrtsFirstLv). */
  firstLvId: string;
  /** Display title (resolved via i18n). */
  name: LocalizedText;
  /** Optional description (often empty `{id:0, text:""}`). */
  desc?: LocalizedText;
  /** Content kind discriminator: document / record / multi_media / text. */
  type: string;
  /** Sort order within the group. */
  order: number;
}

/**
 * A short investigation hint/note attached to a research mission.
 *
 * PrtsNote.json shape: `{ [noteId]: PrtsNote }`.
 * `id` follows the pattern `hint_research_NNN_X_Y`.
 */
export interface PrtsNote {
  id: string;
  desc: LocalizedText;
}

/**
 * A glossary/term reading entry — a list of sub-terms unlocked for a term group.
 *
 * PrtsReading.json shape: `{ [readingId]: PrtsReading }`.
 * The `list` is keyed by a 1-based numeric string index.
 */
export interface PrtsReading {
  /** Reading group id, e.g. "term_001_gm01m13". */
  id: string;
  /** Sub-terms, keyed by numeric index ("1", "2", ...). */
  list: Record<string, PrtsReadingEntry>;
}

/** One term inside a PrtsReading list. */
export interface PrtsReadingEntry {
  uniqId: string;
  name: LocalizedText;
  subtitle?: LocalizedText;
  /** Optional foreign key into a PrtsItem (when the term has a full document). */
  prtsId?: string;
  order: number;
}

/**
 * A research/investigation mission: a themed collection of documents and notes.
 *
 * PrtsInvestigate.json shape: `{ [investigateId]: PrtsInvestigate }`.
 * `collectionIdList`/`noteIdList` reference PrtsItem / PrtsNote ids.
 */
export interface PrtsInvestigate {
  /** Mission id, e.g. "research_001". */
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  /** Numeric investigation index for ordering. */
  index: number;
  /** Owning domain id (e.g. "domain_2"). */
  domainId?: string;
  /** Investigation type (observed: 0). */
  type?: number;
  /** All document/item ids collected by this mission. */
  collectionIdList: string[];
  /** All hint/note ids attached to this mission. */
  noteIdList: string[];
  /** Sub-category breakdown of the collection (parallel to collectionIdList). */
  categoryDataList?: PrtsInvestigateCategoryEntry[];
  /** Document id unlocked when this mission completes (foreign key into PrtsItem). */
  unlockPrts?: string;
  /** Reward items granted on completion (unused by MCP; passed through). */
  rewardItemList?: Array<{ id: string; count: number }>;
}

/** A sub-category inside a PrtsInvestigate's collection breakdown. */
export interface PrtsInvestigateCategoryEntry {
  index: number;
  name: LocalizedText;
  collectionIdList: string[];
  noteIdList: string[];
}

// ---------------------------------------------------------------------------
// In-game encyclopedia (Wiki)
// ---------------------------------------------------------------------------

/**
 * A top-level wiki category.
 *
 * WikiCategoryTable.json shape: `{ [categoryId]: WikiCategory }`.
 * Observed ids: wiki_type_building, wiki_type_equip, wiki_type_item,
 * wiki_type_monster, wiki_type_tutorial, wiki_type_weapon.
 */
export interface WikiCategory {
  categoryId: string;
  categoryName: LocalizedText;
  /** Display priority (lower = earlier). */
  categoryPriority: number;
}

/**
 * A group within a wiki category (the second level of the wiki tree).
 *
 * WikiGroupTable.json shape: `{ [categoryId]: { list: WikiGroup[] } }`.
 */
export interface WikiGroup {
  groupId: string;
  groupName: LocalizedText;
  iconId?: string;
}

/**
 * Wiki entries grouped by domain — a flat id list per domain.
 *
 * WikiEntryTable.json shape: `{ [domainId]: { list: string[] } }`.
 * The strings are foreign keys into WikiEntryData.
 */
export interface WikiEntryList {
  /** Entry ids belonging to this domain. */
  list: string[];
}

/**
 * A wiki entry's data — the encyclopedia leaf node.
 *
 * WikiEntryDataTable.json shape: `{ [id]: WikiEntryData }` (the key and the
 * `id` field are the same value — upstream duplicates it). `prtsId` is the
 * cross-link into the PRTS archive: when present, it points at a PrtsDocument
 * that holds the lore text for this entry. `refItemId` /
 * `refMonsterTemplateId` point into the mechanics tables (v0.2.0 bundle),
 * used to show game stats — not dereferenced by v0.4's lore tools but kept
 * for completeness.
 */
export interface WikiEntryData {
  /** Entry id (same as the dict key). */
  id: string;
  /** Owning group id (foreign key into WikiGroup). */
  groupId: string;
  /** Foreign key into PrtsDocument — the associated lore document, if any. */
  prtsId?: string;
  /** Optional description (often empty `{id:0, text:""}`). */
  desc?: LocalizedText;
  order: number;
  /** Reference into ItemTable (mechanics; not dereferenced by v0.4). */
  refItemId?: string;
  /** Reference into EnemyTemplateTable (mechanics; not dereferenced by v0.4). */
  refMonsterTemplateId?: string;
}
