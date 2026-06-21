/**
 * GameData tool registrations — character domain (v0.2.0).
 *
 * Three `ef_` tools over the CharacterTable, with i18n resolution handled
 * inside the reader. Tool descriptions are Chinese; data returned uses the
 * process-default language (CN) unless the tool exposes a `lang` option.
 *
 * Items / enemies / stages domains will register their own tools in sibling
 * files as those readers land in later minor versions.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getCharacterInfo,
  listCharacters,
  searchCharacters,
} from "../data/characters.js";
import { SUPPORTED_LANGUAGES } from "../data/datasets.js";

/**
 * Wrap a tool handler so any thrown error (missing data file, unbound
 * store, parse failure) is caught and returned as a Chinese text message
 * instead of propagating to the MCP framework as a protocol error.
 *
 * Per STYLE.md: "缺失数据 / 网络失败时返回人类可读的中文错误消息作为
 * 工具的 text content，不要抛裸异常给 MCP 框架。"
 */
function withGracefulError<T extends Record<string, unknown>>(
  run: (args: T) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
): (args: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (args) => {
    try {
      return await run(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes("not found") || msg.includes("Dataset file")
        ? "数据文件缺失——GameData 可能尚未同步。请稍候（后台 sync 进行中）或检查网络连接。"
        : `处理请求时出错：${msg}`;
      return { content: [{ type: "text", text: hint }] };
    }
  };
}

export function registerGamedataTools(server: McpServer): void {
  server.tool(
    "ef_list_characters",
    [
      "列出《明日方舟：终末地》的所有可玩角色。",
      "返回每个角色的 ID、名称、职业、稀有度、属性和阵营的简表，按游戏内排序顺序排列。",
      "这是探索角色数据的第一步——先用此工具获取准确 ID 或名称，再传入 ef_get_character_info 获取详细属性（含声优、武器等）。",
    ].join(" "),
    {
      lang: z
        .enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]])
        .default("CN")
        .describe("返回内容使用的语言，默认 CN（简体中文）。"),
    },
    withGracefulError(async ({ lang }) => {
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
    "ef_get_character_info",
    [
      "获取指定角色的详细属性：职业、稀有度、属性、武器类型、声优（中/英/日/韩）、阵营等。",
      "可传入角色 ID（如 chr_0002_endminm，从 ef_list_characters 获取）或准确的角色名（默认语言或英文）。",
      "声优字段会同时返回四种语言的 CV 名字。",
    ].join(" "),
    {
      id_or_name: z
        .string()
        .describe(
          "角色 ID（如 chr_0002_endminm）或准确角色名（如「管理员」「Endministrator」）。建议先用 ef_list_characters 获取 ID。",
        ),
      lang: z
        .enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]])
        .default("CN")
        .describe("名称字段使用的语言，默认 CN。声优字段始终返回全部四种语言。"),
    },
    withGracefulError(async ({ id_or_name, lang }) => {
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

  server.tool(
    "ef_search_characters",
    [
      "在角色名称、ID、职业、属性、阵营等字段中执行正则搜索。",
      "用于按特征模糊查找角色，如「近卫」「6」「Physical」「ENDFIELD」。",
      "搜索范围：名称（默认语言 + 英文）、ID、职业、属性、阵营。返回匹配字段和简短摘要。",
    ].join(" "),
    {
      pattern: z
        .string()
        .describe(
          "正则表达式（大小写不敏感），如「近卫」「6」「Physical」「ENDFIELD」。无效正则会退化为字面子串匹配。",
        ),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe("返回结果数量上限，默认 30。"),
      lang: z
        .enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]])
        .default("CN")
        .describe("名称字段使用的语言，默认 CN。"),
    },
    withGracefulError(async ({ pattern, max_results, lang }) => {
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
