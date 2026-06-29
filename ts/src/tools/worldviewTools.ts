/**
 * Worldview tool registrations — PRTS archive + in-game encyclopedia.
 *
 * Four `ef_` tools over the worldview bundle (v0.4). These expose the
 * in-game lore system that was previously completely inaccessible — the
 * PRTS archive (documents/records/multimedia/investigations) and the
 * in-game encyclopedia (monster/item/weapon entries with cross-linked lore).
 *
 *   - ef_list_lore_categories  → browse the archive + wiki top-level trees
 *   - ef_search_lore           → regex search across all PRTS documents
 *   - ef_read_lore_document    → read one document's full body text
 *   - ef_get_wiki_entry        → read a wiki entry + its linked lore doc
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  hasWorldviewData,
  listLoreCategories as _listLoreCategories,
  listWikiCategories as _listWikiCategories,
  readLoreDocument as _readLoreDocument,
  readWikiEntry as _readWikiEntry,
  searchWorldview as _searchWorldview,
  wikiEntriesForPrts as _wikiEntriesForPrts,
} from "../data/worldview.js";
import { withGracefulError } from "./toolRuntime.js";

function worldviewNotAvailable(): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text",
        text: "世界观数据暂不可用。worldview bundle 可能尚未同步——请稍候（后台 sync 进行中）或检查网络连接。",
      },
    ],
  };
}

export function registerWorldviewTools(server: McpServer): void {
  server.tool(
    "ef_list_lore_categories",
    [
      "列出《明日方舟：终末地》游戏内 PRTS 档案系统与百科系统的分类结构（世界观浏览入口）。",
      "返回两部分：PRTS 档案分类（collection 收藏/document 文档/media 媒体/paper 报告等，含各分类下的一级条目组数量）+ 游戏内百科分类（building 建筑/equip 装备/item 物品/monster 怪物/weapon 武器等）。拿到分类 ID 后，PRTS 侧用 ef_search_lore 直接检索文档，或用 ef_read_lore_document 读已知 ID 的文档。",
      "适用场景：想系统浏览世界观素材范围、了解 PRTS 档案有哪些类目、或确认某个主题大致归属哪类时使用。这是探索世界观的第一步。若已知关键词要直接找文档，用 ef_search_lore 更快。",
    ].join(" "),
    {},
    withGracefulError("worldview bundle", async () => {
      if (!hasWorldviewData()) return worldviewNotAvailable();
      const cats = _listLoreCategories();
      const wikiCats = _listWikiCategories();

      const parts: string[] = [];
      parts.push(`# PRTS 档案分类（共 ${cats.length} 个）`);
      if (cats.length === 0) {
        parts.push("（无）");
      } else {
        parts.push(
          cats
            .map(
              (c) =>
                `- **${c.categoryId}** ${c.displayName}（${c.groupCount} 个条目组）`,
            )
            .join("\n"),
        );
      }

      parts.push("");
      parts.push(`# 游戏内百科分类（共 ${wikiCats.length} 个）`);
      if (wikiCats.length === 0) {
        parts.push("（无）");
      } else {
        parts.push(
          wikiCats
            .map(
              (c) =>
                `- **${c.categoryId}** ${c.displayName}（${c.groupCount} 个组）`,
            )
            .join("\n"),
        );
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }),
  );

  server.tool(
    "ef_search_lore",
    [
      "在所有 PRTS 档案文档中执行正则全文搜索（跨世界观找素材）。",
      "用于按关键词、人名、地名、组织、事件等检索游戏内 PRTS 档案（文档/记录/多媒体），如「塔卫二」「源石」「天使」。搜索范围覆盖每个文档的标题+正文。返回匹配的文档 ID、类型和上下文片段。",
      "适用场景：记得某个世界观概念但不知具体在哪篇文档、想找某组织的所有提及、或要搜集某个设定/事件的所有出处时使用。拿到文档 ID 后用 ef_read_lore_document 读全文。若想浏览分类结构用 ef_list_lore_categories。",
    ].join(" "),
    {
      pattern: z
        .string()
        .max(200, "搜索模式过长（上限 200 字符），请缩短后重试。")
        .describe(
          "正则表达式（大小写不敏感，上限 200 字符），如「塔卫二」「源石」「天使」。无效正则会退化为字面子串匹配。",
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("返回结果数量上限，默认 30。"),
    },
    withGracefulError("worldview bundle", async ({ pattern, max_results }) => {
      if (!hasWorldviewData()) return worldviewNotAvailable();
      const results = _searchWorldview(pattern, max_results);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `未找到匹配「${pattern}」的世界观文档。` }],
        };
      }
      const header = `# 搜索「${pattern}」（${results.length} 条匹配）\n`;
      const body = results
        .map(
          (r) =>
            `**${r.itemId}** | ${r.type} | ${r.title}\n${r.snippet}`,
        )
        .join("\n\n---\n\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );

  server.tool(
    "ef_read_lore_document",
    [
      "读取一个 PRTS 档案文档的完整正文（阅读世界观原文的核心工具）。",
      "返回该文档的标题、正文全文、所属分类、类型（document/record/multi_media）。需要文档 ID（从 ef_search_lore 获取，如「nar_document_v0d8_10_1」）。若该文档被游戏内百科条目引用，会附上关联的百科条目 ID 列表。",
      "适用场景：已通过搜索或浏览定位到某个文档、想读它的完整原文时使用。多媒体类文档可能无正文（仅有标题），属正常情况。若还不知文档 ID，先用 ef_search_lore 或 ef_list_lore_categories 查找。",
    ].join(" "),
    {
      doc_id: z
        .string()
        .describe(
          "文档 ID（PRTS 条目 id），如「nar_document_v0d8_10_1」「nar_record_map02_1_1」。从 ef_search_lore 获取。",
        ),
    },
    withGracefulError("worldview bundle", async ({ doc_id }) => {
      if (!hasWorldviewData()) return worldviewNotAvailable();
      const doc = _readLoreDocument(doc_id);
      if (doc === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到文档「${doc_id}」。请确认 ID 正确（从 ef_search_lore 获取）。`,
            },
          ],
        };
      }

      const parts: string[] = [];
      parts.push(`# ${doc.title}`);
      parts.push(
        `*类型：${doc.type} | 分类：${doc.categoryId || "未知"} | ID：${doc.itemId}*`,
      );
      if (doc.description.length > 0) {
        parts.push("");
        parts.push(`> ${doc.description}`);
      }
      parts.push("");
      parts.push(doc.body.length > 0 ? doc.body : "（该文档无正文内容）");

      // Surface wiki entries that reference this document (reverse cross-link).
      const refs = _wikiEntriesForPrts(doc.itemId);
      if (refs.length > 0) {
        parts.push("");
        parts.push(`**关联百科条目**（${refs.length} 个）：`);
        parts.push(refs.map((id) => `- ${id}`).join("\n"));
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }),
  );

  server.tool(
    "ef_get_wiki_entry",
    [
      "读取一个游戏内百科条目（怪物/物品/武器/建筑等条目详情）。",
      "返回该百科条目的所属分类组、关联的 PRTS 档案文档 ID（若有）、描述。百科条目的 ID 形如「wiki_eny_0018_lbtough」「wiki_item_...」。拿到关联的 prtsId 后可传给 ef_read_lore_document 阅读该条目的世界观背景文档。",
      "适用场景：想了解某个游戏内实体的百科信息（如某怪物的设定归属）、或要顺藤摸瓜找到它关联的世界观文档时使用。这是连接「游戏机制」与「叙事设定」的桥梁。若要直接搜文档用 ef_search_lore。",
    ].join(" "),
    {
      entry_id: z
        .string()
        .describe(
          "百科条目 ID，如「wiki_eny_0018_lbtough」。形如 wiki_eny_/wiki_item_/wiki_equip_ 等。",
        ),
    },
    withGracefulError("worldview bundle", async ({ entry_id }) => {
      if (!hasWorldviewData()) return worldviewNotAvailable();
      const entry = _readWikiEntry(entry_id);
      if (entry === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到百科条目「${entry_id}」。请确认 ID 正确（形如 wiki_eny_*/wiki_item_*/wiki_equip_*）。`,
            },
          ],
        };
      }

      const parts: string[] = [];
      parts.push(`# 百科条目 ${entry.entryId}`);
      parts.push(
        `*所属组：${entry.groupName}（${entry.groupId}）*`,
      );
      if (entry.description.length > 0) {
        parts.push("");
        parts.push(`> ${entry.description}`);
      }
      if (entry.prtsId) {
        parts.push("");
        parts.push(`**关联世界观文档**：\`${entry.prtsId}\`（用 ef_read_lore_document 阅读全文）`);
      }
      if (entry.refItemId || entry.refMonsterTemplateId) {
        parts.push("");
        const refs: string[] = [];
        if (entry.refItemId) refs.push(`物品引用：\`${entry.refItemId}\``);
        if (entry.refMonsterTemplateId) {
          refs.push(`怪物模板：\`${entry.refMonsterTemplateId}\``);
        }
        parts.push(`*${refs.join(" | ")}*`);
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }),
  );
}
