/**
 * Character table core — store binding, table cache, and entry resolution.
 *
 * Owns the single source of truth for the parsed `CharacterTable.json`:
 * the store reference, the lazy parse cache, and the multi-key resolver
 * (id / CN name / EN name / engName). The operations module
 * (`./characters.js`) and the profiles module (`./characterProfiles.js`)
 * both resolve entries through `resolveCharacterEntry` so lookup
 * precedence stays consistent across the character domain.
 *
 * ## Table shape
 *
 * CharacterTable.json: `{ [characterId: string]: CharacterEntry }`.
 * The characterId format is `chr_NNNN_slug` (e.g. `chr_0002_endminm`).
 * There are ~29 entries (as of the first export, 2026-06).
 *
 * Name / CV fields come through the i18n resolver (`./texts.ts`) so
 * callers get actual strings, not int64 hashes.
 */

import {
  resolveText,
  type LanguageCode,
  type LocalizedText,
} from "./texts.js";
import type { JsonStore } from "./stores.js";

// ---------------------------------------------------------------------------
// Types (mirror the CharacterTable sub-objects we read)
//
// name, CV-name, and all {id, text} localization refs share the same shape as
// texts.ts's LocalizedText. Reusing that single canonical type here (instead
// of file-private LocalizedField / CvField duplicates) keeps one name for the
// {id, text} contract across the whole character domain.
// ---------------------------------------------------------------------------

/** The cvName sub-object shape. */
interface CvNameObject {
  ChiCVName?: LocalizedText;
  EngCVName?: LocalizedText;
  JapCVName?: LocalizedText;
  KorCVName?: LocalizedText;
  charId?: string;
}

/** Raw CharacterTable.json entry. Only fields we read are typed. */
export interface CharacterEntry {
  charId: string;
  name: LocalizedText;
  engName?: string;
  phoneticName?: string;
  profession: number;
  rarity: number;
  department?: string;
  charTypeId?: string;
  weaponType?: number;
  mainAttrType?: number;
  subAttrType?: number;
  sortOrder?: number;
  defaultWeaponId?: string;
  superArmor?: number;
  cvName?: CvNameObject;
  profileRecord?: unknown[];
  profileVoice?: unknown[];
  attributes?: unknown[];
}

// ---------------------------------------------------------------------------
// Lazy cache + store binding
// ---------------------------------------------------------------------------

let _characterTable: Record<string, CharacterEntry> | null = null;

export function clearCharacterCaches(): void {
  _characterTable = null;
}

let _store: JsonStore | null = null;

export function bindCharacterStore(store: JsonStore): void {
  _store = store;
  clearCharacterCaches();
}

function store(): JsonStore {
  if (_store === null) {
    throw new Error(
      "Character reader used before bindCharacterStore() — call it once at startup.",
    );
  }
  return _store;
}

function table(): Record<string, CharacterEntry> {
  if (_characterTable !== null) return _characterTable;
  // Int64-safe parse: CharacterTable.name.id and cvName.*.id are int64
  // localization hashes that exceed Number.MAX_SAFE_INTEGER. Plain
  // readJson would truncate them and break i18n lookups.
  _characterTable = store().readJsonInt64Safe<Record<string, CharacterEntry>>(
    "tables/CharacterTable.json",
  );
  return _characterTable;
}

// ---------------------------------------------------------------------------
// Internal accessor — exported for the operations module (same domain)
// ---------------------------------------------------------------------------

/**
 * Return the parsed table sorted by `sortOrder` (ascending, stable).
 * The operations module uses this to produce deterministic list/search output.
 */
export function sortedEntries(): Array<[string, CharacterEntry]> {
  return Object.entries(table()).sort(
    (a, b) => (a[1].sortOrder ?? 9999) - (b[1].sortOrder ?? 9999),
  );
}

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a character by id, CN name, requested-lang name, or engName.
 * Returns `{id, entry}` on hit, `null` on miss. Shared by getCharacterInfo
 * (operations) and getCharacterArchives/getCharacterVoices (profiles) so
 * both use the same lookup precedence.
 */
export function resolveCharacterEntry(
  idOrName: string,
  lang: LanguageCode = "CN",
): { id: string; entry: CharacterEntry } | null {
  const t = table();
  // Try exact id first.
  let entry: CharacterEntry | undefined = t[idOrName];
  let resolvedId = idOrName;

  // Fall back to matching on resolved name (CN/EN) or engName.
  if (entry === undefined) {
    for (const [cid, e] of Object.entries(t)) {
      const cnName = resolveText(e.name, "CN", "");
      const targetName = resolveText(e.name, lang, "");
      const engName = e.engName ?? "";
      if (
        cid === idOrName ||
        cnName === idOrName ||
        targetName === idOrName ||
        engName === idOrName
      ) {
        entry = e;
        resolvedId = cid;
        break;
      }
    }
  }

  if (entry === undefined) return null;
  return { id: resolvedId, entry };
}
