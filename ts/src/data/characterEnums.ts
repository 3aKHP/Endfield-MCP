/**
 * Character enum → canonical Chinese name mappings.
 *
 * Pure data, zero imports, zero side effects. Split out of `characters.ts`
 * so the operation functions (`listCharacters`, `getCharacterInfo`,
 * `searchCharacters`) depend on these by import rather than by inline
 * definition, and so the table/lookup core (`characterTable.ts`) stays
 * free of display-name concerns.
 *
 * All three maps were verified against the real export (v0.2 data) by
 * cross-checking CharProfessionTable.json + I18nTextTable_CN.json.
 */

/**
 * Profession enum → canonical Chinese name.
 * Verified against CharProfessionTable.json + I18nTextTable_CN.json.
 * 0=近卫, 2=重装, 4=辅助, 5=术师, 7=先锋, 8=突击.
 * Missing values (1,3,6) don't appear in current character data.
 */
export const PROFESSION_NAMES_CN: Record<number, string> = {
  0: "近卫",
  2: "重装",
  4: "辅助",
  5: "术师",
  7: "先锋",
  8: "突击",
};

/** CharType enum → canonical Chinese name. */
export const CHARTYPE_NAMES_CN: Record<string, string> = {
  Physical: "物理",
  Cryst: "结晶",
  Fire: "火",
  Natural: "自然",
  Pulse: "脉动",
};

/** WeaponType enum → canonical Chinese name. */
export const WEAPON_TYPE_NAMES_CN: Record<number, string> = {
  1: "剑",
  2: "刀",
  3: "枪",
  5: "弓",
  6: "法器",
};
