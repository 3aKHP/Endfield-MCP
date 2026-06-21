/**
 * Character data reader — Endfield CharacterTable.json access layer.
 *
 * Reads the raw `{characterId: CharacterEntry}` table and projects it into
 * tool-friendly shapes. Name / CV fields come through the i18n resolver
 * (`./texts.ts`) so callers get actual strings, not int64 hashes.
 *
 * ## Table shape
 *
 * CharacterTable.json: `{ [characterId: string]: CharacterEntry }`.
 * The characterId format is `chr_NNNN_slug` (e.g. `chr_0002_endminm`).
 * There are ~29 entries (as of the first export, 2026-06).
 *
 * ## Key fields (verified against chr_0002_endminm)
 *
 *   charId        string    "chr_0002_endminm"
 *   name          {id,text} → CN: "管理员", EN: "Endministrator"
 *   engName       string    "Endministrator" (pre-filled, non-localized)
 *   profession    number    0..8, see PROFESSION_NAMES
 *   rarity        number    4 | 5 | 6
 *   department    string    "ENDFIELD INDUSTRIES"
 *   charTypeId    string    "Physical" | "Cryst" | "Fire" | "Natural" | "Pulse"
 *   weaponType    number    1 | 2 | 3 | 5 | 6
 *   mainAttrType  number    attribute enum
 *   subAttrType   number    attribute enum
 *   cvName        object    {ChiCVName, EngCVName, JapCVName, KorCVName, charId}
 *                           each CV is {id,text}; resolved via texts.ts
 */

import { resolveText, type LanguageCode } from "./texts.js";
import type { JsonStore } from "./stores.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single CV entry inside CharacterEntry.cvName. */
interface CvField {
  id: string;
  text: string;
}

/** The cvName sub-object shape. */
interface CvNameObject {
  ChiCVName?: CvField;
  EngCVName?: CvField;
  JapCVName?: CvField;
  KorCVName?: CvField;
  charId?: string;
}

/** The `{id, text}` localization shape used by name/desc fields. */
interface LocalizedField {
  id: string;
  text: string;
}

/** Raw CharacterTable.json entry. Only fields we read are typed. */
interface CharacterEntry {
  charId: string;
  name: LocalizedField;
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
// Enum mappings
// ---------------------------------------------------------------------------

/**
 * Profession enum → canonical Chinese name.
 * Verified against CharProfessionTable.json + I18nTextTable_CN.json.
 * 0=近卫, 2=重装, 4=辅助, 5=术师, 7=先锋, 8=突击.
 * Missing values (1,3,6) don't appear in current character data.
 */
const PROFESSION_NAMES_CN: Record<number, string> = {
  0: "近卫",
  2: "重装",
  4: "辅助",
  5: "术师",
  7: "先锋",
  8: "突击",
};

/** CharType enum → canonical Chinese name. */
const CHARTYPE_NAMES_CN: Record<string, string> = {
  Physical: "物理",
  Cryst: "结晶",
  Fire: "火",
  Natural: "自然",
  Pulse: "脉动",
};

/** WeaponType enum → canonical Chinese name. */
const WEAPON_TYPE_NAMES_CN: Record<number, string> = {
  1: "剑",
  2: "刀",
  3: "枪",
  5: "弓",
  6: "法器",
};

// ---------------------------------------------------------------------------
// Lazy cache + clear hook
// ---------------------------------------------------------------------------

let _characterTable: Record<string, CharacterEntry> | null = null;

export function clearCharacterCaches(): void {
  _characterTable = null;
}

// ---------------------------------------------------------------------------
// Store binding
// ---------------------------------------------------------------------------

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
// Public projections
// ---------------------------------------------------------------------------

/** Compact summary for list views. */
export interface CharacterListItem {
  id: string;
  name: string;
  engName: string;
  profession: string;
  rarity: number;
  charType: string;
  department: string;
}

/** Detailed view for per-character lookup. */
export interface CharacterInfo {
  id: string;
  name: string;
  engName: string;
  phoneticName: string;
  profession: string;
  professionCode: number;
  rarity: number;
  department: string;
  charType: string;
  weaponType: string;
  weaponTypeCode: number;
  cvNames: {
    chinese: string;
    english: string;
    japanese: string;
    korean: string;
  };
  sortOrder: number;
  defaultWeaponId: string;
}

/** Sort characters by sortOrder (ascending, stable). */
function sortedEntries(): Array<[string, CharacterEntry]> {
  return Object.entries(table()).sort(
    (a, b) => (a[1].sortOrder ?? 9999) - (b[1].sortOrder ?? 9999),
  );
}

/** List all characters with default-language names resolved. */
export function listCharacters(
  lang: LanguageCode = "CN",
): CharacterListItem[] {
  return sortedEntries().map(([id, e]) => ({
    id,
    name: resolveText(e.name, lang, e.engName ?? id),
    engName: e.engName ?? "",
    profession: PROFESSION_NAMES_CN[e.profession] ?? `未知(${e.profession})`,
    rarity: e.rarity,
    charType: e.charTypeId
      ? CHARTYPE_NAMES_CN[e.charTypeId] ?? e.charTypeId
      : "未知",
    department: e.department ?? "未知",
  }));
}

/** Get detailed info for one character by id (exact match) or name. */
export function getCharacterInfo(
  idOrName: string,
  lang: LanguageCode = "CN",
): CharacterInfo | null {
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

  return {
    id: resolvedId,
    name: resolveText(entry.name, lang, entry.engName ?? resolvedId),
    engName: entry.engName ?? "",
    phoneticName: entry.phoneticName ?? "",
    profession: PROFESSION_NAMES_CN[entry.profession] ??
      `未知(${entry.profession})`,
    professionCode: entry.profession,
    rarity: entry.rarity,
    department: entry.department ?? "未知",
    charType: entry.charTypeId
      ? CHARTYPE_NAMES_CN[entry.charTypeId] ?? entry.charTypeId
      : "未知",
    weaponType: entry.weaponType !== undefined
      ? WEAPON_TYPE_NAMES_CN[entry.weaponType] ?? `未知(${entry.weaponType})`
      : "未知",
    weaponTypeCode: entry.weaponType ?? -1,
    cvNames: {
      chinese: resolveText(entry.cvName?.ChiCVName, "CN", ""),
      english: resolveText(entry.cvName?.EngCVName, "EN", ""),
      japanese: resolveText(entry.cvName?.JapCVName, "JP", ""),
      korean: resolveText(entry.cvName?.KorCVName, "KR", ""),
    },
    sortOrder: entry.sortOrder ?? 9999,
    defaultWeaponId: entry.defaultWeaponId ?? "",
  };
}

/**
 * Regex search across names and key fields.
 *
 * Searches resolved names (CN + engName), charId, profession, department,
 * and charType. Returns compact matches with a snippet showing where the
 * pattern hit.
 */
export function searchCharacters(
  pattern: string,
  maxResults = 30,
  lang: LanguageCode = "CN",
): Array<{ id: string; name: string; snippet: string }> {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    // Fall back to literal substring if the regex is malformed.
    const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(literal, "i");
  }

  const out: Array<{ id: string; name: string; snippet: string }> = [];
  for (const [id, e] of sortedEntries()) {
    const name = resolveText(e.name, lang, e.engName ?? id);
    const engName = e.engName ?? "";
    const profession = PROFESSION_NAMES_CN[e.profession] ?? "";
    const charTypeId = e.charTypeId ?? "";
    // charType field is searchable by both the raw English id (e.g.
    // "Physical") and the Chinese-mapped name (e.g. "物理"), so users
    // searching in either language hit.
    const charTypeCN = charTypeId
      ? CHARTYPE_NAMES_CN[charTypeId] ?? ""
      : "";
    const charTypeSearchable = [charTypeId, charTypeCN]
      .filter(Boolean)
      .join("/");
    const dept = e.department ?? "";

    const fields: Array<[string, string]> = [
      ["名称", name],
      ["英文名", engName],
      ["ID", id],
      ["职业", profession],
      ["属性", charTypeSearchable],
      ["阵营", dept],
    ];

    const hit = fields.find(([, v]) => re.test(v));
    if (hit) {
      out.push({
        id,
        name,
        snippet: `${hit[0]}: ${hit[1]}`,
      });
      if (out.length >= maxResults) break;
    }
  }
  return out;
}
