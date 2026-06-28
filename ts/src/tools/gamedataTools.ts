/**
 * GameData tool registrations — character domain (v0.3.0).
 *
 * Five `ef_` tools over the CharacterTable, split by use case to mirror
 * PRTS-MCP's proven three-way separation:
 *
 *   - ef_get_character_archives  → background story text (fan-creation core)
 *   - ef_get_character_voices    → voice line text (fan-creation core)
 *   - ef_get_character_basic_info → numeric info (profession/rarity/CV)
 *   - ef_list_characters         → roster listing
 *   - ef_search_characters       → regex search across key fields
 *
 * Tool descriptions are Chinese; data returned uses the process-default
 * language (CN) unless the tool exposes a `lang` option.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getCharacterArchives,
  getCharacterVoices,
} from "../data/characterProfiles.js";
import {
  getCharacterInfo,
  listCharacters,
  searchCharacters,
} from "../data/characters.js";
import { SUPPORTED_LANGUAGES } from "../data/datasets.js";
import { withGracefulError } from "./toolRuntime.js";

const langSchema = z
  .enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]])
  .default("CN");

export function registerGamedataTools(server: McpServer): void {
  // ----- Fan-creation core: archives + voices -----

  server.tool(
    "ef_get_character_archives",
    [
      "获取指定角色的档案资料（背景故事文本）。",
      "返回角色的基础档案、人事简述、档案资料等背景故事文本——这是写人物向同人作品时的核心素材。",
      "传入角色 ID（从 ef_list_characters 获取）或准确角色名（默认语言或英文）。若需查询语音台词请用 ef_get_character_voices；若需职业/稀有度等数值请用 ef_get_character_basic_info。",
    ].join(" "),
    {
      id_or_name: z
        .string()
        .describe("角色 ID（如 chr_0002_endminm）或准确角色名（如「管理员」「Endministrator」）。"),
      lang: langSchema.describe("返回内容使用的语言，默认 CN（简体中文）。"),
    },
    withGracefulError("GameData", async ({ id_or_name, lang }) => {
      const archives = getCharacterArchives(
        id_or_name,
        lang as Parameters<typeof getCharacterArchives>[1],
      );
      if (archives === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到角色「${id_or_name}」的档案数据。请用 ef_list_characters 查看所有可用 ID 或名称。`,
            },
          ],
        };
      }
      if (archives.length === 0) {
        return {
          content: [{ type: "text", text: `角色「${id_or_name}」暂无档案资料。` }],
        };
      }
      const parts = archives.map(
        (a) => `## ${a.title}\n\n${a.text}`,
      );
      return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
    }),
  );

  server.tool(
    "ef_get_character_voices",
    [
      "获取指定角色的所有语音台词记录。",
      "返回包含触发条件（如「行动准备1」「编入队伍1」「观看作战记录」）及对应台词文本的完整列表——这是塑造角色语气和语言风格的核心素材。",
      "传入角色 ID 或准确角色名。每角色约 55 条语音。若需背景故事请用 ef_get_character_archives。",
    ].join(" "),
    {
      id_or_name: z
        .string()
        .describe("角色 ID（如 chr_0005_chen）或准确角色名（如「陈千语」「Chen Qianyu」）。"),
      lang: langSchema.describe("返回内容使用的语言，默认 CN。"),
    },
    withGracefulError("GameData", async ({ id_or_name, lang }) => {
      const voices = getCharacterVoices(
        id_or_name,
        lang as Parameters<typeof getCharacterVoices>[1],
      );
      if (voices === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到角色「${id_or_name}」的语音数据。请用 ef_list_characters 查看所有可用 ID 或名称。`,
            },
          ],
        };
      }
      if (voices.length === 0) {
        return {
          content: [{ type: "text", text: `角色「${id_or_name}」暂无语音台词。` }],
        };
      }
      const lines = voices.map(
        (v) => `**[${v.index}] ${v.title}**：${v.text}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }),
  );

  // ----- Numeric info -----

  server.tool(
    "ef_get_character_basic_info",
    [
      "获取指定角色的基本数值信息。",
      "返回职业、稀有度（星级）、属性、武器类型、声优（中/英/日/韩）、阵营等结构化信息。适合快速了解角色定位。",
      "若需背景故事请用 ef_get_character_archives；若需语音台词请用 ef_get_character_voices。",
    ].join(" "),
    {
      id_or_name: z
        .string()
        .describe("角色 ID（如 chr_0002_endminm）或准确角色名。"),
      lang: langSchema.describe("名称字段使用的语言，默认 CN。声优字段始终返回全部四种语言。"),
    },
    withGracefulError("GameData", async ({ id_or_name, lang }) => {
      const info = getCharacterInfo(
        id_or_name,
        lang as Parameters<typeof getCharacterInfo>[1],
      );
      if (info === null) {
        return {
          content: [
            {
              type: "text",
              text: `未找到角色「${id_or_name}」。请用 ef_list_characters 查看所有可用 ID 或名称。`,
            },
          ],
        };
      }
      const lines: string[] = [
        `# ${info.name}${info.engName ? ` (${info.engName})` : ""}`,
        "",
        `- **ID**: ${info.id}`,
        `- **职业**: ${info.profession} (code ${info.professionCode})`,
        `- **稀有度**: ${info.rarity}★`,
        `- **属性**: ${info.charType}`,
        `- **武器类型**: ${info.weaponType} (code ${info.weaponTypeCode})`,
        `- **阵营**: ${info.department}`,
        `- **默认武器**: ${info.defaultWeaponId || "（无）"}`,
      ];
      const cv = info.cvNames;
      if (cv.chinese || cv.english || cv.japanese || cv.korean) {
        lines.push("- **声优**:");
        if (cv.chinese) lines.push(`  - 中文: ${cv.chinese}`);
        if (cv.english) lines.push(`  - 英文: ${cv.english}`);
        if (cv.japanese) lines.push(`  - 日文: ${cv.japanese}`);
        if (cv.korean) lines.push(`  - 韩文: ${cv.korean}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }),
  );

  // ----- Roster listing + search -----

  server.tool(
    "ef_list_characters",
    [
      "列出《明日方舟：终末地》的所有可玩角色。",
      "返回每个角色的 ID、名称、职业、稀有度、属性和阵营的简表，按游戏内排序顺序排列。",
      "这是探索角色数据的第一步——先用此工具获取准确 ID 或名称，再传入 ef_get_character_archives（档案）/ ef_get_character_voices（语音）/ ef_get_character_basic_info（数值）获取详细内容。",
    ].join(" "),
    {
      lang: langSchema.describe("返回内容使用的语言，默认 CN（简体中文）。"),
    },
    withGracefulError("GameData", async ({ lang }) => {
      const list = listCharacters(lang as Parameters<typeof listCharacters>[0]);
      if (list.length === 0) {
        return {
          content: [{ type: "text", text: "角色表为空或数据未同步。" }],
        };
      }
      const header = `# 角色（共 ${list.length} 个）\n`;
      const body = list
        .map(
          (c) =>
            `- **${c.id}** ${c.name}${c.engName ? ` (${c.engName})` : ""} — ${c.profession} / ${c.rarity}★ / ${c.charType} / ${c.department}`,
        )
        .join("\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );

  server.tool(
    "ef_search_characters",
    [
      "在角色名称、ID、职业、属性、阵营等字段中执行正则搜索。",
      "用于按特征模糊查找角色，如「近卫」「6」「Physical」「ENDFIELD」。",
      "搜索范围：名称（默认语言 + 英文）、ID、职业、属性（含中文映射）、阵营。返回匹配字段和简短摘要。",
    ].join(" "),
    {
      pattern: z
        .string()
        .max(200, "搜索模式过长（上限 200 字符），请缩短后重试。")
        .describe(
          "正则表达式（大小写不敏感，上限 200 字符），如「近卫」「6」「Physical」「ENDFIELD」。无效正则会退化为字面子串匹配。",
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("返回结果数量上限，默认 30。"),
      lang: langSchema.describe("名称字段使用的语言，默认 CN。"),
    },
    withGracefulError("GameData", async ({ pattern, max_results, lang }) => {
      const results = searchCharacters(
        pattern,
        max_results,
        lang as Parameters<typeof searchCharacters>[2],
      );
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `未找到匹配「${pattern}」的角色。` }],
        };
      }
      const header = `# 搜索「${pattern}」（${results.length} 条匹配）\n`;
      const body = results
        .map((r) => `**${r.id}** ${r.name}\n${r.snippet}`)
        .join("\n\n---\n\n");
      return { content: [{ type: "text", text: header + body }] };
    }),
  );
}
