/**
 * Story reader tests.
 *
 * Covers the four story-domain operations (listStoryChapters, listStories,
 * readStory, searchStories) and two pure helpers (chapterPrefix,
 * normalizeLine) exported for direct edge-case testing.
 *
 * Uses synthetic fixtures matching the real endfield-story-CN.zip layout
 * (index.json / missions.json / search.json / conv/<key>.json at the store
 * root — no subdirectory wrapping). No dependency on the full export.
 *
 * Fixture design notes:
 *   - index entries span every chapterPrefix branch (e1, e10, sm1, c6, gm01,
 *     a1, f1) plus one non-matching id to hit the fallback branch.
 *   - missions.json includes one chapter whose first mission has a name and
 *     one whose doesn't (displayName fallback to chapterId).
 *   - conv files exercise all four normalizeLine branches (speaker/actor/
 *     text-only/empty) and the string|number scene union.
 *   - search.json is optional; one test loads it, another omits it to verify
 *     the empty-fallback path.
 */

import { afterAll, describe, it, expect, beforeEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryStore } from "../src/data/stores.js";
import { bindStoryStore, clearStoryCaches } from "../src/data/story.js";
import {
  chapterPrefix,
  listStoryChapters,
  listStories,
} from "../src/data/storyChapters.js";
import { normalizeLine, readStory } from "../src/data/storyScenes.js";
import { searchStories } from "../src/data/storySearch.js";

const TMP = mkdtempSync(join(tmpdir(), "ef-story-"));

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Catalog: 8 entries spanning every chapterPrefix branch + one fallback.
// Field abbreviations mirror the real RawIndexEntry: k=key, d=domain,
// m=mission, s=scene, t=type, a=actorCount, n=lineCount, p=preview.
const INDEX = {
  entries: [
    { k: "e1m1s1", d: "black", m: "e1m1", s: 1, t: "e", a: 2, n: 10, p: "主线1-1开场" },
    { k: "e1m2s1", d: "black", m: "e1m2", s: 1, t: "e", a: 3, n: 12, p: "主线1-2" },
    { k: "e10m4s1", d: "black", m: "e10m4", s: 1, t: "e", a: 4, n: 8, p: "主线10-4" },
    { k: "sm1l1m1s1", d: "dlg", m: "sm1l1m1", s: 1, t: "sm", a: 2, n: 6, p: "支线1" },
    { k: "c6m1s1", d: "dlg", m: "c6m1", s: 1, t: "c", a: 1, n: 4, p: "角色6" },
    { k: "gm01m1s1", d: "cutscene", m: "gm01m1", s: 1, t: "e", a: 0, n: 3, p: "门关01" },
    { k: "a1m6d2s1", d: "env", m: "a1m6d2", s: 1, t: "a", a: 2, n: 7, p: "活动1-6" },
    { k: "f1m1s1", d: "mail", m: "f1m1", s: 1, t: "f", a: 0, n: 2, p: "设施1" },
    // Non-matching mission id (no leading letters+digits) → chapterPrefix
    // returns the input unchanged, so it becomes its own single-entry chapter.
    { k: "special_001", d: "dlg", m: "special", s: 1, t: "x", a: 1, n: 1, p: "特殊" },
  ],
};

// Mission names: e1m1 and e10m4 have names; e1m2 intentionally missing
// to exercise the "scan siblings for a display name" path (should find
// e1m1's name for the whole e1 chapter). c6m1 has no name either, so
// chapter "c6" falls back to chapterId as displayName.
const MISSIONS = {
  missionNames: {
    e1m1: "第一章：抵达",
    e10m4: "第十章：终局",
    sm1l1m1: "支线：第一层",
    gm01m1: "门之关卡 01",
    a1m6d2: "活动剧情 1-6",
    f1m1: "设施档案 1",
  },
};

// Search index: 3 entries with concatenated text. The 30/80 snippet window
// logic is exercised by the entry whose match sits far from both edges.
const SEARCH = {
  entries: [
    { k: "e1m1s1", x: "开场白：欢迎来到罗德岛。这里是管理员。" },
    { k: "e1m2s1", x: "战斗开始，敌人出现，准备好迎接挑战。" },
    { k: "c6m1s1", x: "角色6的独白，关于过去与未来。" },
  ],
};

beforeEach(() => {
  // Clean slate per test — clearStoryCaches so each test rebuilds from
  // whatever fixtures are currently on disk (some tests rewrite them).
  clearStoryCaches();
});

/** Write the standard fixture set (index + missions + search + one conv). */
function writeStandardFixtures(): void {
  writeFileSync(join(TMP, "index.json"), JSON.stringify(INDEX));
  writeFileSync(join(TMP, "missions.json"), JSON.stringify(MISSIONS));
  writeFileSync(join(TMP, "search.json"), JSON.stringify(SEARCH));
  mkdirSync(join(TMP, "conv"), { recursive: true });
  bindStoryStore(new DirectoryStore(TMP));
}

// ---------------------------------------------------------------------------
// chapterPrefix — pure helper, edge cases
// ---------------------------------------------------------------------------

describe("chapterPrefix", () => {
  it("extracts leading letters + first digit run", () => {
    expect(chapterPrefix("e1m1")).toBe("e1");
    expect(chapterPrefix("e10m4")).toBe("e10");
    expect(chapterPrefix("sm1l1m1")).toBe("sm1");
    expect(chapterPrefix("gm01m1")).toBe("gm01");
  });

  it("returns the prefix for activity/facility patterns", () => {
    expect(chapterPrefix("a1m6d2")).toBe("a1");
    expect(chapterPrefix("f1m1")).toBe("f1");
    expect(chapterPrefix("c6m1")).toBe("c6");
  });

  it("returns input unchanged when no leading letter+digits", () => {
    expect(chapterPrefix("special")).toBe("special");
    expect(chapterPrefix("123abc")).toBe("123abc");
  });

  it("handles empty string", () => {
    expect(chapterPrefix("")).toBe("");
  });

  it("is case-insensitive on the letter run", () => {
    // Regex flag is /i; uppercase letters still match, digit run preserved.
    expect(chapterPrefix("E1M1")).toBe("E1");
    expect(chapterPrefix("SM1L1M1")).toBe("SM1");
  });
});

// ---------------------------------------------------------------------------
// normalizeLine — pure helper, four-branch classification
// ---------------------------------------------------------------------------

describe("normalizeLine", () => {
  it("classifies SNS lines with `speaker` as dialog", () => {
    const line = normalizeLine({ speaker: "管理员", text: "你好。" });
    expect(line.type).toBe("dialog");
    expect(line.role).toBe("管理员");
    expect(line.text).toBe("你好。");
  });

  it("classifies standard lines with `actor` as dialog", () => {
    const line = normalizeLine({ actor: "阿米娅", text: "博士！" });
    expect(line.type).toBe("dialog");
    expect(line.role).toBe("阿米娅");
    expect(line.text).toBe("博士！");
  });

  it("prefers `speaker` over `actor` when both are present", () => {
    // The SNS branch is checked first in the source.
    const line = normalizeLine({
      speaker: "SNS名",
      actor: "演员名",
      text: "内容",
    });
    expect(line.role).toBe("SNS名");
  });

  it("classifies text-only lines as narration", () => {
    const line = normalizeLine({ id: "n1", text: "场景描述。" });
    expect(line.type).toBe("narration");
    expect(line.role).toBeNull();
    expect(line.text).toBe("场景描述。");
  });

  it("returns empty-text narration for lines with no text", () => {
    // Fallback branch: empty object, or object with only hint/id.
    const empty = normalizeLine({});
    expect(empty.type).toBe("narration");
    expect(empty.role).toBeNull();
    expect(empty.text).toBe("");

    const hintOnly = normalizeLine({ hint: "提示" });
    expect(hintOnly.type).toBe("narration");
    expect(hintOnly.text).toBe("");
  });

  it("treats speaker-without-text as narration", () => {
    // The SNS branch requires BOTH speaker AND text. Speaker alone falls
    // through to the empty-text fallback (no text field).
    const line = normalizeLine({ speaker: "管理员" });
    expect(line.type).toBe("narration");
    expect(line.text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// listStoryChapters — catalog-dependent
// ---------------------------------------------------------------------------

describe("listStoryChapters", () => {
  beforeEach(writeStandardFixtures);

  it("derives chapters from mission id prefixes", () => {
    const chapters = listStoryChapters();
    const ids = chapters.map((c) => c.chapterId).sort();
    // e1, e10, sm1, c6, gm01, a1, f1, special (8 distinct prefixes from 9 entries).
    expect(ids).toEqual(["a1", "c6", "e1", "e10", "f1", "gm01", "sm1", "special"]);
  });

  it("counts scenes per chapter correctly", () => {
    const chapters = listStoryChapters();
    const e1 = chapters.find((c) => c.chapterId === "e1");
    expect(e1!.entryCount).toBe(2); // e1m1 + e1m2

    const e10 = chapters.find((c) => c.chapterId === "e10");
    expect(e10!.entryCount).toBe(1);
  });

  it("resolves displayName from the first mission with a name", () => {
    // e1 chapter: e1m1 has a name, e1m2 does not → displayName from e1m1.
    const chapters = listStoryChapters();
    const e1 = chapters.find((c) => c.chapterId === "e1");
    expect(e1!.displayName).toBe("第一章：抵达");
  });

  it("falls back to chapterId when no mission in the chapter has a name", () => {
    const chapters = listStoryChapters();
    const c6 = chapters.find((c) => c.chapterId === "c6");
    expect(c6!.displayName).toBe("c6");
  });

  it("uses the non-matching mission id as its own chapter id and display name", () => {
    const chapters = listStoryChapters();
    const special = chapters.find((c) => c.chapterId === "special");
    expect(special).toBeDefined();
    expect(special!.displayName).toBe("special");
  });

  it("sorts main-story chapters (e*) before others", () => {
    const chapters = listStoryChapters();
    const firstId = chapters[0]!.chapterId;
    expect(firstId.startsWith("e")).toBe(true);
    // All e* chapters come before any non-e* chapter.
    const firstNonE = chapters.findIndex((c) => !c.chapterId.startsWith("e"));
    for (let i = 0; i < firstNonE; i++) {
      expect(chapters[i]!.chapterId.startsWith("e")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// listStories — catalog-dependent
// ---------------------------------------------------------------------------

describe("listStories", () => {
  beforeEach(writeStandardFixtures);

  it("returns scenes in a chapter, sorted by mission then scene", () => {
    const scenes = listStories("e1");
    expect(scenes.length).toBe(2);
    expect(scenes[0]!.mission).toBe("e1m1");
    expect(scenes[1]!.mission).toBe("e1m2");
  });

  it("matches chapter id case-insensitively", () => {
    const lower = listStories("e1");
    const upper = listStories("E1");
    expect(upper.length).toBe(lower.length);
    expect(upper[0]!.key).toBe(lower[0]!.key);
  });

  it("returns empty for unknown chapter", () => {
    expect(listStories("zzz")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readStory — store-dependent, on-demand conv loading
// ---------------------------------------------------------------------------

describe("readStory", () => {
  beforeEach(writeStandardFixtures);

  it("returns null when the conv file does not exist", () => {
    expect(readStory("nonexistent")).toBeNull();
  });

  it("loads a conv file and normalizes all four line types", () => {
    // Write a conv file exercising every normalizeLine branch.
    const conv = {
      key: "test_all_branches",
      kind: "dlg",
      mission: "e1m1",
      scene: 1,
      lines: [
        { speaker: "管理员", text: "SNS对话" }, // speaker→dialog
        { actor: "阿米娅", text: "标准对话" }, // actor→dialog
        { id: "n1", text: "旁白。" }, // text-only→narration
        { hint: "提示无文本" }, // empty→narration
      ],
      optionGroups: [],
    };
    writeFileSync(
      join(TMP, "conv", "test_all_branches.json"),
      JSON.stringify(conv),
    );

    const scene = readStory("test_all_branches");
    expect(scene).not.toBeNull();
    expect(scene!.lines.length).toBe(4);
    expect(scene!.lines[0]).toEqual({
      type: "dialog",
      role: "管理员",
      text: "SNS对话",
    });
    expect(scene!.lines[1]).toEqual({
      type: "dialog",
      role: "阿米娅",
      text: "标准对话",
    });
    expect(scene!.lines[2]).toEqual({
      type: "narration",
      role: null,
      text: "旁白。",
    });
    expect(scene!.lines[3]).toEqual({
      type: "narration",
      role: null,
      text: "",
    });
  });

  it("parses scene as number when the field is numeric", () => {
    const conv = { key: "num_scene", mission: "e1m1", scene: 5, lines: [] };
    writeFileSync(join(TMP, "conv", "num_scene.json"), JSON.stringify(conv));
    const scene = readStory("num_scene");
    expect(scene!.scene).toBe(5);
  });

  it("parses scene when the field is a string", () => {
    // Some upstream data stores scene as a string. Number("3") || 0 = 3.
    const conv = { key: "str_scene", mission: "e1m1", scene: "3", lines: [] };
    writeFileSync(join(TMP, "conv", "str_scene.json"), JSON.stringify(conv));
    const scene = readStory("str_scene");
    expect(scene!.scene).toBe(3);
  });

  it("coerces non-numeric string scene to 0", () => {
    // Number("abc") is NaN; NaN || 0 = 0.
    const conv = { key: "bad_scene", mission: "e1m1", scene: "abc", lines: [] };
    writeFileSync(join(TMP, "conv", "bad_scene.json"), JSON.stringify(conv));
    const scene = readStory("bad_scene");
    expect(scene!.scene).toBe(0);
  });

  it("defaults missing scene to 0", () => {
    const conv = { key: "no_scene", mission: "e1m1", lines: [] };
    writeFileSync(join(TMP, "conv", "no_scene.json"), JSON.stringify(conv));
    const scene = readStory("no_scene");
    expect(scene!.scene).toBe(0);
  });

  it("extracts player choices from optionGroups", () => {
    const conv = {
      key: "with_choices",
      mission: "e1m1",
      scene: 1,
      lines: [],
      optionGroups: [
        { g: 1, options: [{ i: 1, text: "选项A" }, { i: 2, text: "选项B" }] },
        { g: 2, options: [{ i: 3, text: "选项C" }] },
      ],
    };
    writeFileSync(join(TMP, "conv", "with_choices.json"), JSON.stringify(conv));
    const scene = readStory("with_choices");
    expect(scene!.choices.length).toBe(3);
    expect(scene!.choices[0]).toEqual({ index: 1, text: "选项A" });
    expect(scene!.choices[2]).toEqual({ index: 3, text: "选项C" });
  });

  it("resolves missionName from missions.json", () => {
    const conv = { key: "named_mission", mission: "e1m1", scene: 1, lines: [] };
    writeFileSync(join(TMP, "conv", "named_mission.json"), JSON.stringify(conv));
    const scene = readStory("named_mission");
    expect(scene!.missionName).toBe("第一章：抵达");
  });

  it("falls back to mission id when name is missing", () => {
    const conv = { key: "unnamed_mission", mission: "c6m1", scene: 1, lines: [] };
    writeFileSync(join(TMP, "conv", "unnamed_mission.json"), JSON.stringify(conv));
    const scene = readStory("unnamed_mission");
    expect(scene!.missionName).toBe("c6m1");
  });
});

// ---------------------------------------------------------------------------
// searchStories — search-index-dependent
// ---------------------------------------------------------------------------

describe("searchStories", () => {
  beforeEach(writeStandardFixtures);

  it("returns matching entries with key and snippet", () => {
    const hits = searchStories("罗德岛", 10);
    expect(hits.length).toBe(1);
    expect(hits[0]!.key).toBe("e1m1s1");
    expect(hits[0]!.snippet).toContain("罗德岛");
    expect(hits[0]!.entry).toBeDefined();
  });

  it("includes the catalog entry for each hit", () => {
    const hits = searchStories("战斗", 10);
    expect(hits[0]!.entry.mission).toBe("e1m2");
    expect(hits[0]!.entry.key).toBe("e1m2s1");
  });

  it("respects maxResults cap", () => {
    // "." matches everything (3 entries); cap at 2.
    const hits = searchStories(".", 2);
    expect(hits.length).toBe(2);
  });

  it("returns empty when no entries match", () => {
    expect(searchStories("zzznomatch", 10)).toEqual([]);
  });

  it("adds ... prefix when match starts past the 30-char window", () => {
    // matchIdx must exceed 30 for start = matchIdx-30 to be > 0.
    // Construct a 40-char CJK preamble (each char = 1 UTF-16 unit) so
    // "关键词" sits at index 40.
    const preamble = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十";
    expect(preamble.length).toBe(40); // sanity check on the fixture
    writeFileSync(
      join(TMP, "search.json"),
      JSON.stringify({
        entries: [{ k: "e1m1s1", x: `${preamble}关键词出现在这里。` }],
      }),
    );
    clearStoryCaches();
    bindStoryStore(new DirectoryStore(TMP));
    const hits = searchStories("关键词", 10);
    expect(hits.length).toBe(1);
    expect(hits[0]!.snippet.startsWith("...")).toBe(true);
  });

  it("adds ... suffix when match end is within 80 chars of the end", () => {
    // end = matchIdx + 80; suffix added when end < text.length, i.e. when
    // there are > 80 chars of trailing content after the match.
    const trailer = "。".repeat(90); // 90 trailing chars after the match.
    writeFileSync(
      join(TMP, "search.json"),
      JSON.stringify({
        entries: [{ k: "e1m1s1", x: `关键词${trailer}` }],
      }),
    );
    clearStoryCaches();
    bindStoryStore(new DirectoryStore(TMP));
    const hits = searchStories("关键词", 10);
    expect(hits.length).toBe(1);
    expect(hits[0]!.snippet.endsWith("...")).toBe(true);
  });

  it("falls back to literal search on invalid regex", () => {
    // "(" is invalid as a regex; the reader escapes it to \( and searches
    // literally. We seed an entry containing a literal "(" so this proves
    // BOTH that the fallback doesn't throw AND that the escaped pattern
    // actually matches (characters.test.ts:225-232 only proved no-throw;
    // here we go one step further).
    writeFileSync(
      join(TMP, "search.json"),
      JSON.stringify({
        entries: [{ k: "e1m1s1", x: "dialog (with parens) content" }],
      }),
    );
    clearStoryCaches();
    bindStoryStore(new DirectoryStore(TMP));
    const hits = searchStories("(", 10);
    expect(hits.length).toBe(1);
    expect(hits[0]!.key).toBe("e1m1s1");
  });

  it("returns empty when search.json is missing (optional)", () => {
    // Rewrite fixtures WITHOUT search.json — must delete the file written
    // by writeStandardFixtures, since DirectoryStore would otherwise still
    // read the stale one.
    writeFileSync(join(TMP, "index.json"), JSON.stringify(INDEX));
    writeFileSync(join(TMP, "missions.json"), JSON.stringify(MISSIONS));
    const searchPath = join(TMP, "search.json");
    if (existsSync(searchPath)) unlinkSync(searchPath);
    clearStoryCaches();
    bindStoryStore(new DirectoryStore(TMP));
    expect(searchStories("罗德岛", 10)).toEqual([]);
  });
});
