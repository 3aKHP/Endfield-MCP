/**
 * Character profile (archives + voices) reader tests.
 *
 * Covers the fan-creation core: getCharacterArchives / getCharacterVoices
 * (store-dependent) and cleanProfileText (pure helper exported for direct
 * edge-case coverage). Uses synthetic fixtures matching the real
 * CharacterTable + i18n shape — no dependency on the full export.
 *
 * Fixture design notes:
 *   - CharacterTable.json is written as a raw template string because the
 *     int64 localization ids exceed Number.MAX_SAFE_INTEGER and would be
 *     truncated by JSON.stringify of a JS object.
 *   - Two characters: one with full profileRecord + profileVoice (and
 *     rich-text tags in a desc to exercise cleanProfileText end-to-end),
 *     one without either field (null-return branch).
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
} from "../src/data/characters.js";
import {
  cleanProfileText,
  getCharacterArchives,
  getCharacterVoices,
} from "../src/data/characterProfiles.js";

const TMP = mkdtempSync(join(tmpdir(), "ef-profile-"));

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// CharacterTable fixture — raw string so int64 name/title/desc ids survive.
// Two characters: chr_0002_endminm has full profile data (3 records, 2 voices),
// chr_0015_lifeng has no profile fields (null-return branch).
// title/desc ids are unique int64 values; the CN i18n table below maps them.
const CHAR_TABLE_JSON = `{
  "chr_0002_endminm": {
    "charId": "chr_0002_endminm",
    "name": { "id": -7078064683023630592, "text": "" },
    "engName": "Endministrator",
    "profession": 0,
    "rarity": 6,
    "sortOrder": 2,
    "profileRecord": [
      {
        "recordID": "rec_basic_1",
        "recordIndex": 0,
        "recordTitle": { "id": -1111111111111111111, "text": "" },
        "recordDesc":  { "id": -2222222222222222222, "text": "" }
      },
      {
        "recordID": "rec_personnel_1",
        "recordIndex": 1,
        "recordTitle": { "id": -3333333333333333333, "text": "" },
        "recordDesc":  { "id": -4444444444444444444, "text": "" }
      },
      {
        "recordID": "rec_archive_1",
        "recordIndex": 2,
        "recordTitle": { "id": -5555555555555555555, "text": "" },
        "recordDesc":  { "id": -6666666666666666666, "text": "" }
      }
    ],
    "profileVoice": [
      {
        "voId": "vo_battle_1",
        "voiceIndex": 1,
        "voiceTitle": { "id": -7777777777777777777, "text": "" },
        "voiceDesc":  { "id": -8888888888888888888, "text": "" }
      },
      {
        "voId": "vo_idle_1",
        "voiceIndex": 2,
        "voiceTitle": { "id": -9999999999999999999, "text": "" },
        "voiceDesc":  { "id": -1010101010101010101, "text": "" }
      }
    ]
  },
  "chr_0015_lifeng": {
    "charId": "chr_0015_lifeng",
    "name": { "id": -6840171208004431812, "text": "" },
    "engName": "Lifeng",
    "profession": 0,
    "rarity": 6,
    "sortOrder": 15
  }
}`;

// CN i18n table — maps every title/desc id above to a string.
// rec_archive_1's desc deliberately contains BOTH tag families
// (<@profile.key> and <#ba.consume>) plus a close tag </> so the
// cleanProfileText integration test can assert they're all stripped.
const I18N_CN = {
  "-7078064683023630592": "管理员",
  "-6840171208004431812": "黎风",
  "-1111111111111111111": "基础档案",
  "-2222222222222222222": "管理员是罗德岛的基石。",
  "-3333333333333333333": "人员摘要",
  // Mixed tags + nested close tags in this desc:
  "-4444444444444444444": "<@profile.bold>战斗</>经验丰富，擅长<#ba.consume>源石技艺</>。",
  "-5555555555555555555": "档案材料",
  "-6666666666666666666": "  前后有空白的文本  ",
  "-7777777777777777777": "行动准备1",
  "-8888888888888888888": "开始行动。",
  "-9999999999999999999": "编入队伍1",
  "-1010101010101010101": "我准备好了。",
};

const I18N_EN = {
  "-7078064683023630592": "Endministrator",
  "-7777777777777777777": "Battle Preparation 1",
  "-8888888888888888888": "Action starts.",
};

beforeEach(() => {
  mkdirSync(join(TMP, "tables"), { recursive: true });
  mkdirSync(join(TMP, "i18n"), { recursive: true });
  writeFileSync(join(TMP, "tables", "CharacterTable.json"), CHAR_TABLE_JSON);
  writeFileSync(join(TMP, "i18n", "CN.json"), JSON.stringify(I18N_CN));
  writeFileSync(join(TMP, "i18n", "EN.json"), JSON.stringify(I18N_EN));

  // characterProfiles has no bind/clear of its own — it piggybacks on
  // characters.ts. Both text store and character store must be bound,
  // or resolveCharacterEntry throws "used before bindCharacterStore()".
  const store = new DirectoryStore(TMP);
  bindTextStore(store);
  bindCharacterStore(store);
  clearCharacterCaches();
});

// ---------------------------------------------------------------------------
// cleanProfileText — pure helper, edge cases
// ---------------------------------------------------------------------------

describe("cleanProfileText", () => {
  it("returns empty string unchanged", () => {
    expect(cleanProfileText("")).toBe("");
  });

  it("passes through plain text with no tags", () => {
    expect(cleanProfileText("普通文本。")).toBe("普通文本。");
  });

  it("strips <@profile.key>...</> tag pairs", () => {
    const input = "<@profile.bold>战斗</>经验丰富";
    expect(cleanProfileText(input)).toBe("战斗经验丰富");
  });

  it("strips <#ba.consume>...</> tag pairs", () => {
    const input = "擅长<#ba.consume>源石技艺</>。";
    expect(cleanProfileText(input)).toBe("擅长源石技艺。");
  });

  it("strips mixed tag families in one string", () => {
    const input = "<@profile.bold>战斗</>经验丰富，擅长<#ba.consume>源石技艺</>。";
    expect(cleanProfileText(input)).toBe("战斗经验丰富，擅长源石技艺。");
  });

  it("strips tags with dotted keys and underscores", () => {
    // Real data has keys like profile.bold_001, ba.consume.atk_up etc.
    const input = "<@profile.bold_001>X</> and <#ba.consume.atk_up>Y</>";
    expect(cleanProfileText(input)).toBe("X and Y");
  });

  it("strips orphan close tags without a matching open", () => {
    // Defensive: if upstream data has a stray </>, drop it.
    expect(cleanProfileText("text</>tail")).toBe("texttail");
  });

  it("strips orphan open tags without a matching close", () => {
    // The regex only matches complete <@...> / <#...> open tags; an
    // unclosed span is still stripped because the open tag is self-contained.
    expect(cleanProfileText("<@profile.key>unfinished text")).toBe(
      "unfinished text",
    );
  });

  it("trims leading and trailing whitespace after stripping", () => {
    expect(cleanProfileText("  hello  ")).toBe("hello");
    expect(cleanProfileText("  <@x>a</>  ")).toBe("a");
  });

  it("leaves non-tag angle-bracket text alone", () => {
    // < and > that don't match the tag pattern pass through.
    expect(cleanProfileText("3 < 5 && 10 > 2")).toBe("3 < 5 && 10 > 2");
    expect(cleanProfileText("普通<箭头>文本")).toBe("普通<箭头>文本");
  });
});

// ---------------------------------------------------------------------------
// getCharacterArchives — store-dependent
// ---------------------------------------------------------------------------

describe("getCharacterArchives", () => {
  it("returns all archive sections for a character with profile data", () => {
    const archives = getCharacterArchives("chr_0002_endminm", "CN");
    expect(archives).not.toBeNull();
    expect(archives!.length).toBe(3);
    expect(archives![0]!.recordId).toBe("rec_basic_1");
    expect(archives![0]!.title).toBe("基础档案");
  });

  it("cleans rich-text tags from desc text", () => {
    const archives = getCharacterArchives("chr_0002_endminm", "CN");
    // rec_personnel_1's CN desc was "<@profile.bold>战斗</>经验丰富，擅长<#ba.consume>源石技艺</>。"
    const personnel = archives!.find((a) => a.recordId === "rec_personnel_1");
    expect(personnel).toBeDefined();
    expect(personnel!.text).toBe("战斗经验丰富，擅长源石技艺。");
    // No tag artifacts remain.
    expect(personnel!.text).not.toContain("<");
    expect(personnel!.text).not.toContain(">");
  });

  it("trims whitespace in cleaned desc text", () => {
    const archives = getCharacterArchives("chr_0002_endminm", "CN");
    const archive = archives!.find((a) => a.recordId === "rec_archive_1");
    expect(archive!.text).toBe("前后有空白的文本");
  });

  it("honors language parameter", () => {
    const archives = getCharacterArchives("Endministrator", "EN");
    expect(archives).not.toBeNull();
    expect(archives!.length).toBe(3);
    // EN table has no recordTitle/recordDesc ids mapped, so title falls
    // back to recordID (resolveText fallback) and desc resolves to empty.
    expect(archives![0]!.title).toBe("rec_basic_1");
    expect(archives![0]!.text).toBe("");
  });

  it("resolves by CN name and engName, not just id", () => {
    const byCn = getCharacterArchives("管理员", "CN");
    const byEn = getCharacterArchives("Endministrator", "CN");
    expect(byCn).not.toBeNull();
    expect(byEn).not.toBeNull();
    expect(byCn![0]!.recordId).toBe("rec_basic_1");
    expect(byEn![0]!.recordId).toBe("rec_basic_1");
  });

  it("returns null for a character with no profileRecord", () => {
    expect(getCharacterArchives("chr_0015_lifeng", "CN")).toBeNull();
    expect(getCharacterArchives("Lifeng", "CN")).toBeNull();
  });

  it("returns null for unknown character", () => {
    expect(getCharacterArchives("不存在", "CN")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCharacterVoices — store-dependent
// ---------------------------------------------------------------------------

describe("getCharacterVoices", () => {
  it("returns all voice lines for a character with profile data", () => {
    const voices = getCharacterVoices("chr_0002_endminm", "CN");
    expect(voices).not.toBeNull();
    expect(voices!.length).toBe(2);
    expect(voices![0]!.index).toBe(1);
    expect(voices![0]!.title).toBe("行动准备1");
    expect(voices![0]!.text).toBe("开始行动。");
  });

  it("preserves voiceIndex ordering", () => {
    const voices = getCharacterVoices("chr_0002_endminm", "CN");
    expect(voices![0]!.index).toBe(1);
    expect(voices![1]!.index).toBe(2);
  });

  it("honors language parameter", () => {
    const voices = getCharacterVoices("Endministrator", "EN");
    expect(voices).not.toBeNull();
    expect(voices![0]!.title).toBe("Battle Preparation 1");
    expect(voices![0]!.text).toBe("Action starts.");
  });

  it("resolves by CN name and engName", () => {
    const byCn = getCharacterVoices("管理员", "CN");
    const byEn = getCharacterVoices("Endministrator", "CN");
    expect(byCn!.length).toBe(2);
    expect(byEn!.length).toBe(2);
  });

  it("returns null for a character with no profileVoice", () => {
    expect(getCharacterVoices("chr_0015_lifeng", "CN")).toBeNull();
  });

  it("returns null for unknown character", () => {
    expect(getCharacterVoices("不存在", "CN")).toBeNull();
  });
});
