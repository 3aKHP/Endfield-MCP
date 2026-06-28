/**
 * Story tool registrations — dialogue scenes, chapters, search.
 *
 * Four `ef_` tools over the story bundle, mirroring PRTS-MCP's core
 * story tool subset. These are the **fan-creation core** for
 * worldbuilding — writers use them to read in-game dialogue, find
 * specific scenes by keyword, and browse the chapter structure.
 *
 *   - ef_list_story_chapters  → browse chapter structure (main story, side, character)
 *   - ef_list_stories         → list scenes within a chapter
 *   - ef_read_story           → read one full dialogue scene
 *   - ef_search_stories       → full-text search across all scenes
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  hasStoryData,
  listStories as _listStories,
  listStoryChapters as _listStoryChapters,
  readStory as _readStory,
  searchStories as _searchStories,
} from "../data/story.js";
import { withGracefulError } from "./toolRuntime.js";

function storyNotAvailable(): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text",
        text: "剧情数据暂不可用。story bundle 可能尚未同步——请稍候（后台 sync 进行中）或检查网络连接。",
      },
    ],
  };
}

export function registerStoryTools(server: McpServer): void {
  server.tool(
    "ef_list_story_chapters",
    [
      "列出《明日方舟：终末地》的剧情章节结构（浏览剧情目录）。",
      "返回所有章节（主线 e1-e10、支线 sm、角色故事 c、活动 a 等）及其场景数量和显示名称。拿到章节 ID 后传给 ef_list_stories 查看该章下的所有对话场景。",
      "适用场景：想系统阅读某段剧情、浏览全部章节范围，或定位某个故事属于哪条线时使用。这是探索剧情的第一步。若已知关键词要直接找片段，用 ef_search_stories 更快。",
    ].join(" "),
    {},
    withGracefulError("story bundle", async () => {
      if (!hasStoryData()) return storyNotAvailable();
      const chapters = _listStoryChapters();
      if (chapters.length === 0) {
        return { content: [{ type: "text", text: "未找到任何剧情章节。" }] };
      }
      const header = `# 剧情章节（共 ${chapters.length} 个）\n`;
      const body = chapters
        .map(
          (c) =>
            `- **${c.chapterId}** ${c.displayName}（${c.entryCount} 个场景）`,
        )
        .join("\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );

  server.tool(
    "ef_list_stories",
    [
      "列出指定章节下的所有对话场景。",
      "传入章节 ID（从 ef_list_story_chapters 获取，如「e1」「sm1」「c6」），返回该章下所有场景的 key、所属任务、场景号、行数和预览文本。拿到场景 key 后传给 ef_read_story 阅读完整对话。",
      "适用场景：已选定某章节、想看这一章里有哪些具体场景（按任务/场景号排列），从中挑出要细读的那段时使用。",
    ].join(" "),
    {
      chapter_id: z
        .string()
        .describe(
          "章节 ID，如「e1」（主线第一章）、「sm1」（支线）、「c6」（6 号角色的故事）。从 ef_list_story_chapters 获取。",
        ),
    },
    withGracefulError("story bundle", async ({ chapter_id }) => {
      if (!hasStoryData()) return storyNotAvailable();
      const stories = _listStories(chapter_id);
      if (stories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `未找到章节「${chapter_id}」下的场景。请用 ef_list_story_chapters 查看所有可用章节 ID。`,
            },
          ],
        };
      }
      const header = `# 章节「${chapter_id}」（${stories.length} 个场景）\n`;
      const body = stories
        .map(
          (s) =>
            `- **${s.key}** | 任务 ${s.mission} 场景${s.scene} | ${s.lineCount}行 ${s.actorCount}角色 | ${s.preview.slice(0, 60)}${s.preview.length > 60 ? "..." : ""}`,
        )
        .join("\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );

  server.tool(
    "ef_read_story",
    [
      "读取一个对话场景的完整台词（阅读剧情文本的核心工具）。",
      "返回该场景的所有对话行（角色名：台词）、旁白（*斜体*）、玩家选项（如果有）。需要场景 key（从 ef_list_stories 或 ef_search_stories 获取，如「black_a1m6d2_3」）。",
      "适用场景：已定位到某个场景、想读它的完整对话原文时使用。可设 include_narration=false 只保留台词、跳过场景描写。若还不知场景 key，先用 ef_list_stories 或 ef_search_stories 查找。",
    ].join(" "),
    {
      conv_key: z
        .string()
        .describe(
          "场景 key（conv 文件名），如「black_a1m6d2_3」「dlg_map02_lv003_env_2」。从 ef_list_stories 或 ef_search_stories 获取。",
        ),
      include_narration: z
        .boolean()
        .default(true)
        .describe("是否包含旁白和场景描述，默认 true。设为 false 只保留对话台词。"),
    },
    withGracefulError("story bundle", async ({ conv_key, include_narration }) => {
      if (!hasStoryData()) return storyNotAvailable();
      const scene = _readStory(conv_key);
      if (scene === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到场景「${conv_key}」。请确认 key 正确（从 ef_list_stories 或 ef_search_stories 获取）。`,
            },
          ],
        };
      }

      const header = `# ${scene.missionName} · 场景${scene.scene}（${scene.lines.length} 行）\n`;
      const bodyParts: string[] = [];
      for (const line of scene.lines) {
        if (line.type === "dialog") {
          bodyParts.push(`${line.role ?? "（未知）"}：${line.text}`);
        } else if (line.type === "narration" && include_narration) {
          bodyParts.push(`*${line.text}*`);
        }
      }
      if (scene.choices.length > 0) {
        bodyParts.push("\n【玩家选项】");
        for (const c of scene.choices) {
          bodyParts.push(`  ${c.index}. ${c.text}`);
        }
      }
      return { content: [{ type: "text", text: header + bodyParts.join("\n") }] };
    }),
  );

  server.tool(
    "ef_search_stories",
    [
      "在所有剧情对话中执行正则全文搜索（跨剧情找片段）。",
      "用于按关键词、角色名、地点、事件等查找剧情片段，如「源石」「陈千语」「塔卫二」。返回匹配的场景 key、所属任务和预览片段。",
      "适用场景：记得某段剧情的关键词但不知在哪一章、想找某角色出场的所有片段、或要搜集某个设定/事件的所有提及时使用。拿到 key 后用 ef_read_story 读全文。若想系统浏览章节用 ef_list_story_chapters。",
    ].join(" "),
    {
      pattern: z
        .string()
        .max(200, "搜索模式过长（上限 200 字符），请缩短后重试。")
        .describe(
          "正则表达式（大小写不敏感，上限 200 字符），如「源石」「陈千语」「基地」。无效正则会退化为字面子串匹配。",
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("返回结果数量上限，默认 30。"),
    },
    withGracefulError("story bundle", async ({ pattern, max_results }) => {
      if (!hasStoryData()) return storyNotAvailable();
      const results = _searchStories(pattern, max_results);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `未找到匹配「${pattern}」的剧情片段。` }],
        };
      }
      const header = `# 搜索「${pattern}」（${results.length} 条匹配）\n`;
      const body = results
        .map(
          (r) =>
            `**${r.key}** | ${r.entry.mission} | ${r.entry.lineCount}行\n${r.snippet}`,
        )
        .join("\n\n---\n\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );
}
