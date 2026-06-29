/**
 * Dataset specifications for Endfield-MCP.
 *
 * Each dataset describes one GitHub Release asset from the self-hosted
 * EndFieldGameData mirror. The sync layer (`./sync.ts`) consumes these
 * specs without knowing anything about Endfield's data shape.
 *
 * ## Mirror layout
 *
 * The mirror publishes one Release asset: `endfield-tables.zip`. Its
 * internal structure (mirrored from endfield_research_kit's
 * `export_full/structured/StreamingAssets/Table/`, with a cleaner top-level
 * split between game tables and localization):
 *
 * ```
 * endfield-tables.zip
 * ├── tables/                          # 10 core game tables
 * │   ├── CharacterTable.json
 * │   ├── EnemyTable.json
 * │   ├── EnemyTemplateTable.json
 * │   ├── EnemyDisplayInfoTable.json
 * │   ├── EquipTable.json
 * │   ├── EquipItemTable.json
 * │   ├── CharProfessionTable.json
 * │   ├── CharTypeTable.json
 * │   ├── CharacterTagTable.json
 * │   └── ItemTable.json
 * └── i18n/                            # 5 localization tables
 *     ├── CN.json   (← I18nTextTable_CN.json, renamed for brevity)
 *     ├── EN.json
 *     ├── JP.json
 *     ├── TC.json
 *     └── KR.json
 * ```
 *
 * ## Language coverage
 *
 * Five languages chosen for the fan-creation communities they serve:
 * CN (Simplified Chinese, project default), EN, JP, TC (Traditional
 * Chinese), KR. Each is ~9-12MB; combined with the 10 core tables the
 * asset is ~64MB uncompressed (~15-20MB zipped).
 *
 * ## Schema notes
 *
 * Endfield's data architecture separates values from localization: most
 * tables store `{id, text}` objects where `text` is empty and `id` is an
 * int64 hash. The actual string lives in the i18n table under that hash.
 * The `data/texts.ts` module owns that lookup; readers stay ignorant of
 * which language is active.
 */

import AdmZip from "adm-zip";
import {
  type ReleaseArchiveSpec,
  type ReleaseSpec,
} from "./sync.js";

// ---------------------------------------------------------------------------
// Mirror repository coordinates
// ---------------------------------------------------------------------------

/**
 * GitHub coordinates of the self-hosted Endfield data mirror.
 *
 * The mirror is live (3aKHP/EndFieldGameData) with two published Releases:
 * v0.2.0 (endfield-tables.zip) and v0.3.0 (endfield-story-CN.zip). These
 * coordinates feed the sync layer's download URL construction; changing
 * them here re-points all dataset fetches.
 */
export const MIRROR_OWNER = "3aKHP";
export const MIRROR_REPO = "EndFieldGameData";

// ---------------------------------------------------------------------------
// Required-file lists
// ---------------------------------------------------------------------------

/**
 * The 10 core game tables every release must ship.
 *
 * Pinned from the first endfield_research_kit export (2026-06). These cover
 * the v0.2 character-focused scope; items/enemies/equips ship too so later
 * minor versions can add domains without a mirror re-release.
 */
export const TABLE_FILES: readonly string[] = [
  "tables/CharacterTable.json",
  "tables/EnemyTable.json",
  "tables/EnemyTemplateTable.json",
  "tables/EnemyDisplayInfoTable.json",
  "tables/EquipTable.json",
  "tables/EquipItemTable.json",
  "tables/CharProfessionTable.json",
  "tables/CharTypeTable.json",
  "tables/CharacterTagTable.json",
  "tables/ItemTable.json",
] as const;

/**
 * The five localization tables every release must ship.
 *
 * File names are shortened from the upstream `I18nTextTable_<LANG>.json`
 * convention to keep zip paths tidy. Language codes match the upstream
 * suffix: CN, EN, JP, TC, KR.
 */
export const I18N_FILES: readonly string[] = [
  "i18n/CN.json",
  "i18n/EN.json",
  "i18n/JP.json",
  "i18n/TC.json",
  "i18n/KR.json",
] as const;

/** All files the release asset must contain (tables + localization). */
export const ALL_REQUIRED_FILES: readonly string[] = [
  ...TABLE_FILES,
  ...I18N_FILES,
];

/** The five languages the mirror ships, in canonical order. */
export const SUPPORTED_LANGUAGES: readonly string[] = [
  "CN",
  "EN",
  "JP",
  "TC",
  "KR",
] as const;

/** Default language when no preference is given. */
export const DEFAULT_LANGUAGE = "CN";

// ---------------------------------------------------------------------------
// Dataset spec type
// ---------------------------------------------------------------------------

/** Identifies one upstream Release dataset. */
export interface ReleaseDatasetSpec {
  /** Stable id for logging / cache partitioning, e.g. "tables". */
  readonly datasetId: string;
  readonly owner: string;
  readonly repo: string;
  /** Asset filename in the GitHub Release, e.g. "endfield-tables.zip". */
  readonly assetName: string;
  /** Paths that must exist inside the asset zip / extracted root. */
  readonly requiredFiles: readonly string[];
}

/** Build a {@link ReleaseSpec} for plain-zip download (no extraction). */
export function releaseSpecForDataset(
  dataset: ReleaseDatasetSpec,
  localZip: string,
): ReleaseSpec {
  return {
    owner: dataset.owner,
    repo: dataset.repo,
    assetName: dataset.assetName,
    localZip,
    validateZip: (zipPath) => validateDatasetZip(dataset, zipPath),
  };
}

/** Build a {@link ReleaseArchiveSpec} for download-and-extract. */
export function archiveSpecForDataset(
  dataset: ReleaseDatasetSpec,
  localZip: string,
  localRoot: string,
): ReleaseArchiveSpec {
  return {
    owner: dataset.owner,
    repo: dataset.repo,
    assetName: dataset.assetName,
    localZip,
    localRoot,
    requiredFiles: dataset.requiredFiles,
  };
}

// ---------------------------------------------------------------------------
// Dataset definitions
// ---------------------------------------------------------------------------

/**
 * GameData tables — the core v0.2.0 dataset.
 *
 * Bundles the 10 core game tables and 5 localization tables into one
 * ~15-20MB zip asset. One Release per upstream game update; tag is bare
 * semver (v0.2.0, v0.2.1, ...).
 */
export const GAMEDATA_TABLES: ReleaseDatasetSpec = {
  datasetId: "gamedata.tables",
  owner: MIRROR_OWNER,
  repo: MIRROR_REPO,
  assetName: "endfield-tables.zip",
  requiredFiles: ALL_REQUIRED_FILES,
};

/**
 * Story dialogue bundle (CN) — the v0.3.0 dataset.
 *
 * Ships the catalog (index/missions/actors/search) and all 9271 conv
 * files. ~19MB zipped. requiredFiles only lists the catalog — conv/
 * entries are read on-demand by story reader (per-scene fetch), not
 * validated at startup (9271 files would make the check expensive).
 */
export const STORY_REQUIRED_FILES: readonly string[] = [
  "index.json",
  "missions.json",
  "actors.json",
  "search.json",
] as const;

export const STORY_CN: ReleaseDatasetSpec = {
  datasetId: "story.cn",
  owner: MIRROR_OWNER,
  repo: MIRROR_REPO,
  assetName: "endfield-story-CN.zip",
  requiredFiles: STORY_REQUIRED_FILES,
};

/**
 * Worldview bundle — the v0.4.0 dataset.
 *
 * In-game PRTS archive system (documents/records/multimedia/investigations)
 * plus the in-game encyclopedia (wiki entries/categories/groups). Schema
 * differs from the tables/story bundles in one way: most Prts entries carry
 * a `contentId` that is a **string key** (e.g. "text_v0d8_10"), not a direct
 * int64 hash. That key resolves through the root-level RichContentTable.json:
 * `RichContentTable[contentId]` = `{title: {id, text}, contentList: [{content: {id, text}}, ...]}`,
 * and each segment's `content.id` is an int64 hash looked up in i18n/CN.json
 * (shipped in the v0.2.0 tables bundle). The i18n table is intentionally NOT
 * re-bundled here.
 *
 * Layout (see local_dev/docs/worldview-mirror-build.md for the build spec):
 *
 * ```
 * endfield-worldview.zip
 * ├── prts/   (11 narrative tables)
 * ├── wiki/   (4 encyclopedia tables — narrative subset only)
 * └── RichContentTable.json   (contentId → {title, contentList[]} bridge, root-level)
 * ```
 *
 * ~2.7MB raw. The 6 mechanistic Wiki tables (craft/drop/tutorial) are
 * deliberately excluded — v0.4 is lore-first (ROADMAP decision principle).
 */
export const WORLDVIEW_REQUIRED_FILES: readonly string[] = [
  // PRTS narrative hierarchy
  "prts/PrtsCategory.json",
  "prts/PrtsPage.json",
  "prts/PrtsFirstLv.json",
  "prts/PrtsAllItem.json",
  "prts/PrtsDocument.json",
  "prts/PrtsRecord.json",
  "prts/PrtsMultimedia.json",
  "prts/PrtsNote.json",
  "prts/PrtsReading.json",
  "prts/PrtsInvestigate.json",
  "prts/PrtsInvestigateCategory.json",
  // In-game encyclopedia (narrative subset)
  "wiki/WikiCategoryTable.json",
  "wiki/WikiGroupTable.json",
  "wiki/WikiEntryTable.json",
  "wiki/WikiEntryDataTable.json",
  // contentId → {title, contentList[]} rich-content bridge (shared resolver, root-level)
  "RichContentTable.json",
] as const;

export const WORLDVIEW: ReleaseDatasetSpec = {
  datasetId: "worldview",
  owner: MIRROR_OWNER,
  repo: MIRROR_REPO,
  assetName: "endfield-worldview.zip",
  requiredFiles: WORLDVIEW_REQUIRED_FILES,
};

// ---------------------------------------------------------------------------
// Zip validation
// ---------------------------------------------------------------------------

type AdmZipLike = {
  getEntries(): Array<{ entryName: string; isDirectory: boolean }>;
};

/**
 * Validate a downloaded dataset zip against its required-file list.
 *
 * Returns the list of missing required entries (empty = valid). Errors
 * opening the zip are reported as a single descriptive entry so callers
 * can surface them without distinguishing "corrupt" from "incomplete".
 */
export function validateDatasetZip(
  dataset: ReleaseDatasetSpec,
  zipPath: string,
): string[] {
  if (dataset.requiredFiles.length === 0) return [];

  let zip: AdmZipLike;
  try {
    zip = new AdmZip(zipPath) as unknown as AdmZipLike;
  } catch (err) {
    return [
      `${dataset.assetName} is not a valid zip: ${
        err instanceof Error ? err.message : String(err)
      }`,
    ];
  }

  const entries = new Set(
    zip
      .getEntries()
      .filter((e) => !e.isDirectory)
      .map((e) => e.entryName),
  );
  return dataset.requiredFiles.filter((file) => !entries.has(file));
}
