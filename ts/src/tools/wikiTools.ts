/**
 * Endfield Wiki tool registrations — the 6-tool MVP surface.
 *
 * Tool names use the `ef_` prefix (project decision: short prefix, saves
 * context budget vs. the long `endfield_` form). Descriptions are written
 * in Chinese (the project's user-facing language); the underlying wiki
 * content is English, which the calling LLM bridges as needed.
 *
 * Ported from PRTS-MCP's `ts/src/tools/prtsTools.ts`; the tool-call shapes
 * are identical to keep migration intuition between the two projects.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchWiki,
  readPage,
  listSections,
  getCategories,
  getLinks,
  getTemplateData,
} from "../api/endfieldWiki.js";

export function registerWikiTools(server: McpServer): void {
  server.tool(
    "ef_search_wiki",
    [
      "搜索《明日方舟：终末地》英文 Wiki（endfield.wiki.gg）词条。",
      "这是探索世界观设定（阵营、地点、敌人、机制）和查证专有名词英文名的第一步——先搜索拿到准确词条标题，再传给 ef_read_wiki_page 读全文。返回标题、简短摘要和匹配总数。",
      "适用场景：用户想了解世界观/背景设定、需要某个名词的准确英文写法、或要找某个角色/敌人/物品的 Wiki 页面时。Wiki 内容主要是英文，返回结果也是英文，必要时请翻译后再使用。",
    ].join(" "),
    {
      query: z
        .string()
        .describe(
          "搜索关键词，建议用英文以获得最佳匹配，如「Endfield」、「Angelic」、角色英文名。",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("返回结果数量上限，默认 5，最大建议不超过 10。"),
      search_mode: z
        .enum(["text", "title"])
        .default("text")
        .describe("搜索模式：text（全文搜索，默认）或 title（仅搜索标题）。"),
      filter_technical: z
        .boolean()
        .default(true)
        .describe("是否过滤 Template/Module/Widget 等技术命名空间页面，默认 true。"),
    },
    async ({ query, limit, search_mode, filter_technical }) => {
      let result;
      try {
        result = await searchWiki(
          query,
          limit,
          search_mode,
          filter_technical,
        );
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
      if (result.results.length === 0) {
        return {
          content: [{ type: "text", text: `No pages matched '${query}'.` }],
        };
      }
      const header = `# Search "${query}" (${result.totalHits} matches)\n`;
      const body = result.results
        .map((r) => `**${r.title}**\n${r.snippet}`)
        .join("\n\n---\n\n");
      return { content: [{ type: "text", text: header + body }] };
    },
  );

  server.tool(
    "ef_read_wiki_page",
    [
      "读取 endfield.wiki.gg 指定词条的纯文本内容。",
      "返回清洗后的纯文本（已去除 CSS、HTML 标签和实体），内容可能较长。强烈建议先调用 ef_list_wiki_sections 查看目录结构，再用 section_index 按需读取特定章节，避免整页内容过载；不填 section_index 返回整页。",
      "适用场景：已通过 ef_search_wiki 拿到准确标题后，需要该词条的完整正文时使用。如果不确定标题，先用 ef_search_wiki 搜索。",
    ].join(" "),
    {
      page_title: z
        .string()
        .describe(
          "词条标题，需与 Wiki 页面标题完全一致（英文，区分大小写），如「Endfield」、「Angelic」。建议通过 ef_search_wiki 获取准确标题后再传入。",
        ),
      section_index: z
        .number()
        .int()
        .optional()
        .describe(
          "可选章节编号（从 ef_list_wiki_sections 获取）。不填则返回整页内容；填入编号如 1 则仅返回该节。",
        ),
    },
    async ({ page_title, section_index }) => {
      const text = await readPage(page_title, section_index);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "ef_list_wiki_sections",
    [
      "列出 endfield.wiki.gg 页面的目录（章节列表）。",
      "返回章节编号、层级和标题。编号以 T- 开头表示该节来自模板嵌入（如角色信息框）。拿到编号后传给 ef_read_wiki_page 的 section_index 按需读取特定章节。",
      "适用场景：词条内容较长、只想读某一节（如「背景设定」「游戏数据」），或想先了解页面结构再决定读哪部分时使用。比直接整页读取更省上下文。",
    ].join(" "),
    {
      page_title: z
        .string()
        .describe("词条标题，需与 Wiki 页面标题完全一致，如「Endfield」。"),
    },
    async ({ page_title }) => {
      try {
        const sections = await listSections(page_title);
        if (sections.length === 0) {
          return {
            content: [
              { type: "text", text: `Page '${page_title}' has no sections.` },
            ],
          };
        }
        const lines = sections.map(
          (s) => `[${s.index}] L${s.level} ${s.line}`,
        );
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  );

  server.tool(
    "ef_get_wiki_categories",
    [
      "获取 endfield.wiki.gg 页面的分类标签。",
      "返回该页面所属的所有分类（英文），如「Characters」「Weapons」「Items」，可用于判断页面类型和所属体系。",
      "适用场景：需要确认一个词条的归属类别（是角色/敌人/物品/地点），或想顺着分类发现同类相关页面时使用。",
    ].join(" "),
    {
      page_title: z
        .string()
        .describe("词条标题，如「Endfield」、角色英文名等。"),
    },
    async ({ page_title }) => {
      try {
        const cats = await getCategories(page_title);
        if (cats.length === 0) {
          return {
            content: [
              { type: "text", text: `Page '${page_title}' has no categories.` },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: cats.map((c) => `- ${c}`).join("\n") },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  );

  server.tool(
    "ef_get_wiki_links",
    [
      "获取 endfield.wiki.gg 页面的相关链接（知识图谱关系）。",
      "outbound 返回该页面引用的其他词条链接；inbound 返回反向链接（哪些页面引用了它）。可用于发现相关角色、阵营或剧情线索。",
      "适用场景：想围绕某个词条展开、找它的关联实体（如某角色出场的所有章节、引用某阵营的所有角色），或做世界观关系梳理时使用。",
    ].join(" "),
    {
      page_title: z.string().describe("词条标题，如「Endfield」。"),
      direction: z
        .enum(["outbound", "inbound"])
        .default("outbound")
        .describe(
          "链接方向：outbound（页面引用的链接，默认）或 inbound（引用该页面的链接）。",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("返回链接数量上限，默认 30。"),
    },
    async ({ page_title, direction, limit }) => {
      try {
        const result = await getLinks(page_title, direction, limit);
        if (result.links.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Page '${page_title}' has no ${direction} links.`,
              },
            ],
          };
        }
        const header = `# ${direction} links for '${page_title}' (${result.total} total${result.hasMore ? ", truncated" : ""})\n`;
        const body = result.links.map((l) => `- ${l}`).join("\n");
        return { content: [{ type: "text", text: header + body }] };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  );

  server.tool(
    "ef_get_wiki_template",
    [
      "提取 endfield.wiki.gg 页面中的结构化模板数据（infobox 字段）。",
      "解析页面源码里的 {{Template|key=value|...}} 调用，返回按模板名分组的键值对字典，如角色信息框里的属性、阵营、稀有度等数值字段。模板名和键名为英文（Wiki 源码原样），值可能是英文或数字。",
      "适用场景：需要某个实体的结构化数值/属性（而非阅读正文叙述），或要对比多个角色的 infobox 字段时使用。",
    ].join(" "),
    {
      page_title: z
        .string()
        .describe("词条标题，如角色英文名。建议先用 ef_search_wiki 确认标题。"),
    },
    async ({ page_title }) => {
      try {
        const templates = await getTemplateData(page_title);
        const names = Object.keys(templates);
        if (names.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Page '${page_title}' has no template data.`,
              },
            ],
          };
        }
        const parts = names.map((name) => {
          const fields = templates[name]!;
          const lines = Object.entries(fields).map(
            ([k, v]) =>
              `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
          );
          return `**${name}**\n${lines.join("\n")}`;
        });
        return { content: [{ type: "text", text: parts.join("\n\n") }] };
      } catch (e) {
        return {
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  );
}
