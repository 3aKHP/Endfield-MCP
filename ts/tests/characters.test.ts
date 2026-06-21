/**
 * Character reader tests.
 *
 * Uses a small synthetic fixture matching the real CharacterTable +
 * i18n shape (2 characters, 1 language) to verify the reader's
 * projections without depending on the full export.
 *
 * Key things covered:
 *   - int64 id resolution through the text layer
 *   - profession/rarity/charType/weaponType enum mapping
 *   - list/get/search output shapes
 *   - name lookup by id, CN name, and EN name
 */

import { afterAll, describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryStore } from "../src/data/stores.js";
import { bindTextStore } from "../src/data/texts.js";
import {
  bindCharacterStore,
  clearCharacterCaches,
  getCharacterInfo,
  listCharacters,
  searchCharacters,
} from "../src/data/characters.js";

const TMP = mkdtempSync(join(tmpdir(), "ef-char-"));

// Clean up the temp dir once after all tests in this file finish.
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// CharacterTable fixture. Written as a raw string template (not
// JSON.stringify of a JS object) because the int64 name ids exceed
// Number.MAX_SAFE_INTEGER and would be truncated by JS number storage.
// The reader uses readJsonInt64Safe to recover them as strings.
const CHAR_TABLE_JSON = `{
  "chr_0002_endminm": {
    "charId": "chr_0002_endminm",
    "name": { "id": -7078064683023630592, "text": "" },
    "engName": "Endministrator",
    "phoneticName": "",
    "profession": 0,
    "rarity": 6,
    "department": "ENDFIELD INDUSTRIES",
    "charTypeId": "Physical",
    "weaponType": 1,
    "mainAttrType": 40,
    "subAttrType": 39,
    "sortOrder": 2,
    "defaultWeaponId": "wpn_sword_0003",
    "cvName": {
      "ChiCVName": { "id": -5913937456330954032, "text": "" },
      "EngCVName": { "id": 4987789270862624807, "text": "" },
      "JapCVName": { "id": -6380558815583919859, "text": "" },
      "KorCVName": { "id": -5621077862909136750, "text": "" },
      "charId": "chr_0002_endminm"
    }
  },
  "chr_0015_lifeng": {
    "charId": "chr_0015_lifeng",
    "name": { "id": -6840171208004431812, "text": "" },
    "engName": "Lifeng",
    "phoneticName": "",
    "profession": 0,
    "rarity": 6,
    "department": "ENDFIELD INDUSTRIES",
    "charTypeId": "Natural",
    "weaponType": 5,
    "sortOrder": 15,
    "defaultWeaponId": "wpn_bow_0001"
  }
}`;

// Minimal CN i18n table — object form, keys are int64 strings.
const I18N_CN = {
  "-7078064683023630592": "管理员",
  "-6840171208004431812": "黎风",
  "-5913937456330954032": "杨超然",
  "4987789270862624807": "Hyoie O'Grady",
  "-6380558815583919859": "津田拓也",
  "-5621077862909136750": "이상준",
};

const I18N_EN = {
  "-7078064683023630592": "Endministrator",
  "-6840171208004431812": "Lifeng",
  "4987789270862624807": "Hyoie O'Grady",
};

// JP/TC/KR only need the CV ids resolved for the four-language CV test.
// Character name ids are intentionally absent to prove miss→empty behaviour.
const I18N_JP = {
  "-6380558815583919859": "津田拓也",
};
const I18N_TC = {};
const I18N_KR = {
  "-5621077862909136750": "이상준",
};

beforeEach(() => {
  // Ensure subdirectories exist (writeFileSync doesn't create them).
  mkdirSync(join(TMP, "tables"), { recursive: true });
  mkdirSync(join(TMP, "i18n"), { recursive: true });

  // CharacterTable written as raw text so int64 ids survive.
  writeFileSync(join(TMP, "tables", "CharacterTable.json"), CHAR_TABLE_JSON);
  // i18n tables: keys are already strings, safe to stringify.
  writeFileSync(join(TMP, "i18n", "CN.json"), JSON.stringify(I18N_CN));
  writeFileSync(join(TMP, "i18n", "EN.json"), JSON.stringify(I18N_EN));
  writeFileSync(join(TMP, "i18n", "JP.json"), JSON.stringify(I18N_JP));
  writeFileSync(join(TMP, "i18n", "TC.json"), JSON.stringify(I18N_TC));
  writeFileSync(join(TMP, "i18n", "KR.json"), JSON.stringify(I18N_KR));

  const store = new DirectoryStore(TMP);
  bindTextStore(store);
  bindCharacterStore(store);
  clearCharacterCaches();
});

describe("listCharacters", () => {
  it("returns all characters sorted by sortOrder", () => {
    const list = listCharacters("CN");
    expect(list.length).toBe(2);
    // sortOrder 2 before 15
    expect(list[0]!.id).toBe("chr_0002_endminm");
    expect(list[1]!.id).toBe("chr_0015_lifeng");
  });

  it("resolves names via i18n", () => {
    const list = listCharacters("CN");
    expect(list[0]!.name).toBe("管理员");
    expect(list[1]!.name).toBe("黎风");
  });

  it("maps profession/rarity/charType to Chinese names", () => {
    const endmin = listCharacters("CN")[0]!;
    expect(endmin.profession).toBe("近卫");
    expect(endmin.rarity).toBe(6);
    expect(endmin.charType).toBe("物理");
    expect(endmin.department).toBe("ENDFIELD INDUSTRIES");
  });

  it("honors language parameter", () => {
    const list = listCharacters("EN");
    expect(list[0]!.name).toBe("Endministrator");
    expect(list[1]!.name).toBe("Lifeng");
  });
});

describe("getCharacterInfo", () => {
  it("looks up by exact id", () => {
    const info = getCharacterInfo("chr_0002_endminm", "CN");
    expect(info).not.toBeNull();
    expect(info!.name).toBe("管理员");
    expect(info!.engName).toBe("Endministrator");
    expect(info!.profession).toBe("近卫");
    expect(info!.professionCode).toBe(0);
    expect(info!.weaponType).toBe("剑");
    expect(info!.weaponTypeCode).toBe(1);
  });

  it("looks up by resolved CN name", () => {
    const info = getCharacterInfo("管理员", "CN");
    expect(info).not.toBeNull();
    expect(info!.id).toBe("chr_0002_endminm");
  });

  it("looks up by engName", () => {
    const info = getCharacterInfo("Lifeng", "CN");
    expect(info).not.toBeNull();
    expect(info!.id).toBe("chr_0015_lifeng");
    expect(info!.name).toBe("黎风");
  });

  it("returns null for unknown name", () => {
    expect(getCharacterInfo("不存在", "CN")).toBeNull();
  });

  it("resolves all four CV language fields", () => {
    const info = getCharacterInfo("chr_0002_endminm", "CN");
    expect(info!.cvNames.chinese).toBe("杨超然");
    expect(info!.cvNames.english).toBe("Hyoie O'Grady");
    expect(info!.cvNames.japanese).toBe("津田拓也");
    expect(info!.cvNames.korean).toBe("이상준");
  });

  it("returns empty CV strings when cvName is absent", () => {
    const info = getCharacterInfo("chr_0015_lifeng", "CN");
    expect(info!.cvNames.chinese).toBe("");
    expect(info!.cvNames.english).toBe("");
  });
});

describe("searchCharacters", () => {
  it("finds by profession name", () => {
    const hits = searchCharacters("近卫", 10, "CN");
    expect(hits.length).toBe(2);
    expect(hits.every((h) => h.snippet.includes("近卫"))).toBe(true);
  });

  it("finds by charType", () => {
    const hits = searchCharacters("Natural", 10, "CN");
    expect(hits.length).toBe(1);
    expect(hits[0]!.id).toBe("chr_0015_lifeng");
  });

  it("finds by department", () => {
    const hits = searchCharacters("ENDFIELD", 10, "CN");
    expect(hits.length).toBe(2);
  });

  it("respects maxResults", () => {
    const hits = searchCharacters("近卫", 1, "CN");
    expect(hits.length).toBe(1);
  });

  it("returns empty for no matches", () => {
    expect(searchCharacters("zzznomatch", 10, "CN")).toEqual([]);
  });

  it("falls back to literal search on invalid regex without crashing", () => {
    // An unbalanced `(` is invalid as a regex. The reader escapes it to
    // `\(近卫` and searches literally. Since no field contains the literal
    // sequence "(近卫", this correctly returns 0 matches — the test
    // verifies the fallback path doesn't throw and returns cleanly.
    const hits = searchCharacters("(近卫", 10, "CN");
    expect(hits.length).toBe(0);
  });
});
