/**
 * Character domain — operations facade (list / get / search projections).
 *
 * Thin layer over `./characterTable.js` (table cache + resolver) and
 * `./characterEnums.js` (profession/charType/weaponType display names).
 * Produces tool-friendly shapes (`CharacterListItem`, `CharacterInfo`)
 * with names resolved through `./texts.ts` so callers get actual strings,
 * not int64 hashes.
 *
 * Lifecycle + resolver symbols (`bindCharacterStore`, `clearCharacterCaches`,
 * `resolveCharacterEntry`, `CharacterEntry`) are re-exported from
 * `./characterTable.js` so existing consumers (server, startupSync,
 * characterProfiles, tests, smoke scripts) keep importing from
 * `./characters.js` unchanged.
 */

import { resolveText, type LanguageCode } from "./texts.js";
import {
  sortedEntries,
  resolveCharacterEntry,
  type CharacterEntry,
} from "./characterTable.js";
import {
  PROFESSION_NAMES_CN,
  CHARTYPE_NAMES_CN,
  WEAPON_TYPE_NAMES_CN,
} from "./characterEnums.js";

// ---------------------------------------------------------------------------
// Re-exports — preserve the public surface from before the split
// ---------------------------------------------------------------------------

export {
  bindCharacterStore,
  clearCharacterCaches,
  resolveCharacterEntry,
} from "./characterTable.js";
export type { CharacterEntry } from "./characterTable.js";

// ---------------------------------------------------------------------------
// Output shapes
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

// ---------------------------------------------------------------------------
// Public projections
// ---------------------------------------------------------------------------

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

export function getCharacterInfo(
  idOrName: string,
  lang: LanguageCode = "CN",
): CharacterInfo | null {
  const resolved = resolveCharacterEntry(idOrName, lang);
  if (resolved === null) return null;
  const { id: resolvedId, entry } = resolved;

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
