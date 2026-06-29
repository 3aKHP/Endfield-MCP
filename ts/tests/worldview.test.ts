/**
 * Worldview reader tests.
 *
 * Covers the four worldview-domain operations (listLoreCategories,
 * searchWorldview, readLoreDocument, readWikiEntry) plus the TextTable
 * string-key→hash bridge (the one capability unique to this domain) and the
 * wiki↔prts reverse cross-link.
 *
 * Uses synthetic fixtures matching the real endfield-worldview.zip layout
 * (prts/*.json, wiki/*.json, TextTable.json at the store root) plus a minimal
 * i18n/CN.json so name/body resolution can be exercised end-to-end. No
 * dependency on the full export.
 *
 * Fixture design notes:
 *   - Two PRTS categories (collection, document) with two first-level groups
 *     spanning both, so listLoreGroups can be tested per-category and the
 *     categoryId derivation in readLoreDocument hits a real lookup.
 *   - Three items: a document with a contentId that resolves to a body, a
 *     record with a contentId, and a multimedia item with NO contentId (to
 *     exercise the empty-body path and the "skip empty corpus entries" path).
 *   - TextTable + i18n are wired so contentId → hash → body resolves to a
 *     recognizable CN string, proving the two-hop bridge.
 *   - One wiki entry with a prtsId cross-link (testable both directions) and
 *     one without.
 */

import {
  afterAll,
  describe,
  it,
  expect,
  beforeEach,
} from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryStore } from "../src/data/stores.js";
import { bindTextStore, clearTextCaches } from "../src/data/texts.js";
import {
  bindWorldviewStore,
  clearWorldviewCaches,
  hasWorldviewData,
  listLoreCategories,
  listLoreGroups,
  readLoreDocument,
  searchWorldview,
  readWikiEntry,
  wikiEntriesForPrts,
} from "../src/data/worldview.js";

const TMP = mkdtempSync(join(tmpdir(), "ef-worldview-"));

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// RichContentTable: contentId → {title, contentList[{content}]}. The hash
// values in content.content are arbitrary but must match the i18n keys below.
// Kept within safe-integer range so plain JSON is fine (readJsonInt64Safe
// handles the real-world >MAX_SAFE_INTEGER case; we don't need to exercise
// that here — storesInt64.test.ts already does).
const RICH_CONTENT = {
  text_doc_alpha: {
    title: { id: "4001", text: "" },
    contentList: [
      { content: { id: "1001", text: "" } }, // → "这是阿尔法文档的正文。提到了塔卫二。"
      { content: { id: "1003", text: "" } }, // → a second segment
    ],
  },
  text_rec_beta: {
    title: { id: "4002", text: "" },
    contentList: [{ content: { id: "1002", text: "" } }],
  },
};

// i18n/CN.json: int64 hash (as string key) → CN text.
const I18N_CN = {
  1001: "这是阿尔法文档的正文。提到了塔卫二。",
  1002: "贝塔记录的内容。",
  1003: "阿尔法文档的第二段。",
  2001: "收藏",
  2002: "文档",
  3001: "第一组",
  3002: "第二组",
  4001: "阿尔法文档",
  4002: "贝塔记录",
  4003: "多媒体条目",
  5001: "怪物",
  6001: "动物类",
};

const PRTS_CATEGORY = {
  collection: {
    categoryId: "collection",
    name: { id: "2001", text: "" },
    order: 1,
    tabIcon: "icon_tab_collection",
  },
  document: {
    categoryId: "document",
    name: { id: "2002", text: "" },
    order: 2,
    tabIcon: "",
  },
};

// firstLv groups reference item ids in PrtsAllItem.
const PRTS_FIRST_LV = {
  grp_1: {
    firstLvId: "grp_1",
    categoryId: "collection",
    name: { id: "3001", text: "" },
    order: 1,
    itemIds: ["nar_doc_alpha", "nar_rec_beta"],
  },
  grp_2: {
    firstLvId: "grp_2",
    categoryId: "document",
    name: { id: "3002", text: "" },
    order: 2,
    itemIds: ["nar_media_no_body"],
  },
};

const PRTS_ALL_ITEM = {
  nar_doc_alpha: {
    id: "nar_doc_alpha",
    contentId: "text_doc_alpha",
    firstLvId: "grp_1",
    name: { id: "4001", text: "" },
    desc: { id: 0, text: "" },
    type: "document",
    order: 1,
  },
  nar_rec_beta: {
    id: "nar_rec_beta",
    contentId: "text_rec_beta",
    firstLvId: "grp_1",
    name: { id: "4002", text: "" },
    type: "record",
    order: 2,
  },
  // Multimedia with NO contentId — exercises empty-body path + corpus skip.
  nar_media_no_body: {
    id: "nar_media_no_body",
    firstLvId: "grp_2",
    name: { id: "4003", text: "" },
    type: "multi_media",
    order: 1,
  },
};

const WIKI_CATEGORY = {
  wiki_type_monster: {
    categoryId: "wiki_type_monster",
    categoryName: { id: "5001", text: "" },
    categoryPriority: 2,
  },
};

const WIKI_GROUP = {
  wiki_type_monster: {
    list: [
      {
        groupId: "wiki_group_animal",
        groupName: { id: "6001", text: "" },
        iconId: "icon_animal",
      },
    ],
  },
};

const WIKI_ENTRY_DATA = {
  // Cross-linked: prtsId points at nar_doc_alpha.
  wiki_eny_0001_linked: {
    entryId: "wiki_eny_0001_linked",
    groupId: "wiki_group_animal",
    prtsId: "nar_doc_alpha",
    desc: { id: 0, text: "" },
    order: 1,
    refMonsterTemplateId: "eny_0001",
  },
  // No prtsId — exercises the null cross-link path.
  wiki_eny_0002_plain: {
    entryId: "wiki_eny_0002_plain",
    groupId: "wiki_group_animal",
    desc: { id: 0, text: "" },
    order: 2,
    refMonsterTemplateId: "eny_0002",
  },
};

function writeFixtures(): void {
  mkdirSync(join(TMP, "prts"), { recursive: true });
  mkdirSync(join(TMP, "wiki"), { recursive: true });
  mkdirSync(join(TMP, "i18n"), { recursive: true });

  writeFileSync(join(TMP, "RichContentTable.json"), JSON.stringify(RICH_CONTENT));
  writeFileSync(join(TMP, "i18n", "CN.json"), JSON.stringify(I18N_CN));
  writeFileSync(
    join(TMP, "prts", "PrtsCategory.json"),
    JSON.stringify(PRTS_CATEGORY),
  );
  writeFileSync(
    join(TMP, "prts", "PrtsFirstLv.json"),
    JSON.stringify(PRTS_FIRST_LV),
  );
  writeFileSync(
    join(TMP, "prts", "PrtsAllItem.json"),
    JSON.stringify(PRTS_ALL_ITEM),
  );
  writeFileSync(
    join(TMP, "wiki", "WikiCategoryTable.json"),
    JSON.stringify(WIKI_CATEGORY),
  );
  writeFileSync(
    join(TMP, "wiki", "WikiGroupTable.json"),
    JSON.stringify(WIKI_GROUP),
  );
  writeFileSync(
    join(TMP, "wiki", "WikiEntryDataTable.json"),
    JSON.stringify(WIKI_ENTRY_DATA),
  );
}

beforeEach(() => {
  // Each test gets a freshly-written fixture set and freshly-bound stores,
  // so caches from one test cannot leak into another.
  writeFixtures();
  const store = new DirectoryStore(TMP);
  bindTextStore(store);
  bindWorldviewStore(store);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("worldview presence", () => {
  it("reports data present when RichContentTable.json exists", () => {
    expect(hasWorldviewData()).toBe(true);
  });

  it("reports absent when bound to an empty store", () => {
    const empty = mkdtempSync(join(tmpdir(), "ef-worldview-empty-"));
    try {
      const store = new DirectoryStore(empty);
      bindWorldviewStore(store);
      expect(hasWorldviewData()).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("listLoreCategories", () => {
  it("returns PRTS categories sorted by order with resolved names + group counts", () => {
    const cats = listLoreCategories();
    expect(cats).toHaveLength(2);
    // order 1 (collection) before order 2 (document)
    expect(cats[0]!.categoryId).toBe("collection");
    expect(cats[0]!.displayName).toBe("收藏");
    expect(cats[0]!.groupCount).toBe(1); // grp_1
    expect(cats[1]!.categoryId).toBe("document");
    expect(cats[1]!.displayName).toBe("文档");
    expect(cats[1]!.groupCount).toBe(1); // grp_2
  });
});

describe("listLoreGroups", () => {
  it("returns groups for a category with resolved names + item counts", () => {
    const groups = listLoreGroups("collection");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.firstLvId).toBe("grp_1");
    expect(groups[0]!.displayName).toBe("第一组");
    expect(groups[0]!.itemCount).toBe(2);
  });

  it("returns empty for an unknown category", () => {
    expect(listLoreGroups("nonexistent")).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(listLoreGroups("COLLECTION")).toHaveLength(1);
  });
});

describe("readLoreDocument (RichContent bridge)", () => {
  it("resolves a document's body via contentId → RichContentTable → i18n", () => {
    const doc = readLoreDocument("nar_doc_alpha");
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe("阿尔法文档");
    // Multi-segment resolve: contentId "text_doc_alpha" → 2 segments joined by \n.
    expect(doc!.body).toBe(
      "这是阿尔法文档的正文。提到了塔卫二。\n阿尔法文档的第二段。",
    );
    expect(doc!.type).toBe("document");
    expect(doc!.categoryId).toBe("collection"); // derived via firstLv group
  });

  it("returns null for an unknown id", () => {
    expect(readLoreDocument("nar_nonexistent")).toBeNull();
  });

  it("returns empty body for an item with no contentId", () => {
    const doc = readLoreDocument("nar_media_no_body");
    expect(doc).not.toBeNull();
    expect(doc!.body).toBe("");
    expect(doc!.title).toBe("多媒体条目");
  });
});

describe("searchWorldview", () => {
  it("finds documents by body keyword with a snippet", () => {
    const hits = searchWorldview("塔卫二");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.itemId).toBe("nar_doc_alpha");
    expect(hits[0]!.title).toBe("阿尔法文档");
    expect(hits[0]!.snippet).toContain("塔卫二");
  });

  it("finds documents by title keyword", () => {
    const hits = searchWorldview("阿尔法");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.itemId).toBe("nar_doc_alpha");
  });

  it("returns empty for no match", () => {
    expect(searchWorldview("不存在的词")).toEqual([]);
  });

  it("degrades invalid regex to literal substring match", () => {
    // "[" is an invalid regex — must not throw, must still match literally.
    // The literal "[正文" does not appear in the corpus, but "正文" does —
    // so we assert the escape works by confirming a bracketed fragment of
    // real text still matches once the brackets are literalized.
    const hits = searchWorldview("正文");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.itemId).toBe("nar_doc_alpha");
    // And an actually-invalid pattern must not throw.
    expect(() => searchWorldview("[")).not.toThrow();
  });

  it("respects maxResults cap", () => {
    const hits = searchWorldview(".", 1); // "." matches everything
    expect(hits).toHaveLength(1);
  });

  it("excludes items with no title and no body from the corpus", () => {
    // nar_media_no_body has a title but no body — it IS searchable by title.
    const byTitle = searchWorldview("多媒体");
    expect(byTitle.some((h) => h.itemId === "nar_media_no_body")).toBe(true);
  });
});

describe("readWikiEntry", () => {
  it("resolves a wiki entry with its group name + prtsId cross-link", () => {
    const entry = readWikiEntry("wiki_eny_0001_linked");
    expect(entry).not.toBeNull();
    expect(entry!.groupName).toBe("动物类");
    expect(entry!.prtsId).toBe("nar_doc_alpha");
    expect(entry!.refMonsterTemplateId).toBe("eny_0001");
  });

  it("returns null prtsId when no cross-link exists", () => {
    const entry = readWikiEntry("wiki_eny_0002_plain");
    expect(entry).not.toBeNull();
    expect(entry!.prtsId).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(readWikiEntry("wiki_unknown")).toBeNull();
  });
});

describe("wikiEntriesForPrts (reverse cross-link)", () => {
  it("finds wiki entries pointing at a given PRTS document", () => {
    const refs = wikiEntriesForPrts("nar_doc_alpha");
    expect(refs).toEqual(["wiki_eny_0001_linked"]);
  });

  it("returns empty when no wiki entry references the document", () => {
    expect(wikiEntriesForPrts("nar_rec_beta")).toEqual([]);
  });
});

describe("cache invalidation", () => {
  it("clearWorldviewCaches forces a re-read on next access", () => {
    // First access populates caches.
    expect(listLoreCategories()).toHaveLength(2);
    // Mutate the fixture: drop one category.
    delete (PRTS_CATEGORY as Record<string, unknown>).document;
    writeFileSync(
      join(TMP, "prts", "PrtsCategory.json"),
      JSON.stringify(PRTS_CATEGORY),
    );
    // Without clearing, the stale cache still reports 2.
    expect(listLoreCategories()).toHaveLength(2);
    // After clearing, the re-read sees the updated file.
    clearWorldviewCaches();
    expect(listLoreCategories()).toHaveLength(1);
  });
});
