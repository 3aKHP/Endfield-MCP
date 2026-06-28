# Endfield MCP Server

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-000000)](https://bun.sh)

**Language / 语言：** [English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

An MCP Server for [*Arknights: Endfield*](https://endfield.hypergryph.com/) fan creation. It gives any MCP-compatible client — Claude Desktop, Claude Code, Chatbox, and more — live access to Endfield lore, character info, and world-building entries via the [Endfield Talos Wiki](https://endfield.wiki.gg).

This is the sibling project of [PRTS-MCP](https://github.com/3aKHP/prts-mcp) (for the original *Arknights*). Same architecture philosophy, modernized to a single TypeScript implementation on Bun — one codebase covers both the local stdio transport (Claude Desktop) and the remote Streamable HTTP transport (shared servers).

### Current Status (`0.3.1`)

15 tools across three domains — 6 Wiki, 5 Character, 4 Story — all end-to-end working and verified. GameData (characters, story) is served from a self-hosted mirror with auto-sync + bundled offline fallback.

| Tool | Description |
|------|-------------|
| `ef_search_wiki(query, limit?)` | Search Endfield Talos Wiki by keyword |
| `ef_read_wiki_page(page_title, section_index?)` | Fetch plain-text content of a wiki page |
| `ef_list_wiki_sections(page_title)` | Section table of contents for a page |
| `ef_get_wiki_categories(page_title)` | Category tags for a page |
| `ef_get_wiki_links(page_title, direction?, limit?)` | Outbound links or inbound backlinks |
| `ef_get_wiki_template(page_title)` | Structured template data (key-value pairs) |
| `ef_list_characters(lang?)` | List all characters with resolved names/profession/rarity |
| `ef_search_characters(pattern, max_results?, lang?)` | Regex search across character fields |
| `ef_get_character_archives(char_id)` | Character background-story text (3 sections) |
| `ef_get_character_voices(char_id)` | Character voice lines with trigger conditions |
| `ef_get_character_basic_info(char_id)` | Character numeric info (profession/rarity/CV/etc.) |
| `ef_list_story_chapters()` | Story chapter list (364 chapters) |
| `ef_list_stories(chapter_id)` | Scenes within a story chapter |
| `ef_read_story(story_key)` | Full dialogue scene text |
| `ef_search_stories(pattern, max_results?)` | Full-text search across 9271 story scenes |

Wiki content is in English (the wiki's primary language). Tool descriptions are in Chinese. The calling LLM bridges the content language as needed.

### Data Sources

- **Endfield Talos Wiki** (`https://endfield.wiki.gg/api.php`) — lore articles, faction info, world-building entries. Live HTTP requests with browser-style headers (the wiki's WAF blocks bare bots).
- **Self-hosted GameData mirror** (planned for `0.2.0`, repository TBD) — text-only JSON tables (characters, items, stages, enemies) mirrored from [`Variante/endfield_research_kit`](https://github.com/Variante/endfield_research_kit) exports. Hosted on a private domain; no binary assets redistributed.

#### Why these sources

During v0.1 planning we evaluated every candidate Endfield wiki / data source and selected on technical merit:

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| `endfield.wiki.gg` | ✅ Selected | Standard MediaWiki 1.43.6, `api.php` usable with browser-style headers. Largest English Endfield wiki. |
| `endfield.prts.chat` | ❌ Rejected | Not a wiki — it's an AI RAG query tool. Custom FastAPI backend with no public API; all probed endpoints 404. |
| `endfield.games` (END Wiki) | ❌ Rejected | Pure SPA, no MediaWiki, no machine-readable API. |
| `Variante/endfield_research_kit` | ⚠️ Indirect | Local export toolkit, not a data source. Its output contract (`export_full/structured/StreamingAssets/Table/*.json`) defines the schema our mirror will follow. Explicitly forbids redistribution of proprietary content. |
| `daydreamer-json/ak-endfield-api-archive` | ⚠️ Future option | Archives official API responses every 5 min. Possible alternative for v0.3+ if mirror maintenance becomes a burden. |

The selection rationale is documented so future contributors don't re-litigate it. If you're proposing a new source, read this table first.

### Quick Start

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.2.

```bash
git clone https://github.com/3aKHP/Endfield-MCP.git
cd Endfield-MCP/ts
bun install
```

**Local stdio (Claude Desktop / Claude Code):**

```bash
bun run src/server.ts
```

Or add to your MCP client config (paths use forward slashes on all platforms; on Windows you can also use backslashes):

```json
{
  "mcpServers": {
    "endfield": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/Endfield-MCP/ts/src/server.ts"]
    }
  }
}
```

**Remote HTTP server:**

```bash
EF_TRANSPORT=http PORT=3000 bun run src/server.ts
# MCP endpoint: http://localhost:3000/mcp  (POST only, stateless)
# Health check:  http://localhost:3000/health
```

### Configuration (Environment Variables)

| Variable | Default | Allowed | Purpose |
|----------|---------|---------|---------|
| `EF_TRANSPORT` | `stdio` | `stdio` \| `http` | Transport selection |
| `EF_DATA_PATH` | per-user data dir | absolute path | GameData location (setting this disables auto-sync) |
| `EF_WIKI_ENDPOINT` | `https://endfield.wiki.gg/api.php` | URL | Wiki API URL override |
| `EF_WIKI_UA` | Chrome-style UA | string | User-Agent for wiki requests (WAF may reject bare bots) |
| `EF_WIKI_REFERER` | `https://endfield.wiki.gg/` | URL | Referer for wiki requests |
| `PORT` | `3000` | port number | HTTP listen port (`http` transport only) |
| `HOST` | `0.0.0.0` | hostname | HTTP listen host (`http` transport only) |
| `GITHUB_MIRRORS` | (unset) | comma-separated URLs | ghproxy-style mirror URLs for asset downloads (no trailing slash) |

### Verification

```bash
cd ts
bun run typecheck                          # TypeScript zero errors
bun test                                   # unit tests (no network)
bun run scripts/smoke-live.ts              # live WAF-bypass check (hits the real wiki — run manually, not in CI)
```

Or use the all-in-one audit:

```powershell
.\scripts\check-runtime.ps1 -Full          # Windows
./scripts/check-runtime.sh --full          # Unix
```

### Related Projects

- [PRTS-MCP](https://github.com/3aKHP/prts-mcp) — sibling MCP Server for the original *Arknights*. Architecture blueprint for this project.
- [Variante/endfield_research_kit](https://github.com/Variante/endfield_research_kit) — local Endfield data export toolkit. Defines the schema our GameData mirror will follow.
- [Endfield Talos Wiki](https://endfield.wiki.gg) — primary wiki data source.

---

<a id="中文"></a>

## 中文

面向《[明日方舟：终末地](https://endfield.hypergryph.com/)》同人创作的 MCP Server。为 MCP 客户端（Claude Desktop、Claude Code、Chatbox 等）提供终末地世界观、角色资料和阵营设定的实时检索能力。

本项目是 [PRTS-MCP](https://github.com/3aKHP/prts-mcp)（明日方舟本体的姊妹项目）的兄弟项目。相同的架构哲学，但简化为基于 Bun 的单 TypeScript 实现——一套代码同时覆盖本地 stdio 传输（Claude Desktop）和远程 Streamable HTTP 传输（共享服务器）。

### 当前状态（`0.3.1`）

15 个工具覆盖三个域——6 个 Wiki、5 个角色、4 个剧情——全部端到端跑通并验证。GameData（角色 / 剧情）由自建镜像提供，支持自动同步 + bundled 离线兜底。

| 工具 | 说明 |
|------|------|
| `ef_search_wiki(query, limit?)` | 关键词搜索 endfield.wiki.gg 词条 |
| `ef_read_wiki_page(page_title, section_index?)` | 读取指定词条的纯文本内容 |
| `ef_list_wiki_sections(page_title)` | 列出词条的章节目录 |
| `ef_get_wiki_categories(page_title)` | 获取词条的分类标签 |
| `ef_get_wiki_links(page_title, direction?, limit?)` | 获取词条的出链或入链 |
| `ef_get_wiki_template(page_title)` | 提取词条中的结构化模板数据 |
| `ef_list_characters(lang?)` | 列出全部角色（含名称/职业/稀有度） |
| `ef_search_characters(pattern, max_results?, lang?)` | 跨角色字段正则搜索 |
| `ef_get_character_archives(char_id)` | 角色背景故事文本（3 段档案） |
| `ef_get_character_voices(char_id)` | 角色语音台词（含触发条件） |
| `ef_get_character_basic_info(char_id)` | 角色数值信息（职业/稀有度/CV 等） |
| `ef_list_story_chapters()` | 剧情章节列表（364 章） |
| `ef_list_stories(chapter_id)` | 章节内的剧情场景列表 |
| `ef_read_story(story_key)` | 完整剧情对话场景文本 |
| `ef_search_stories(pattern, max_results?)` | 跨 9271 个剧情场景全文检索 |

Wiki 内容以英文为主（站点的主语言），工具描述使用中文。内容由调用方 LLM 负责桥接语言。

### 数据源

- **Endfield Talos Wiki**（`https://endfield.wiki.gg/api.php`）—— 世界观词条、阵营设定、剧情线索。实时 HTTP 请求，需带浏览器风格请求头（站点 WAF 会拦截裸 bot）。
- **自建 GameData 镜像**（计划 `0.2.0`，仓库 TBD）—— 纯文本 JSON 表格（角色、物品、关卡、敌人），参照 [`Variante/endfield_research_kit`](https://github.com/Variante/endfield_research_kit) 的导出契约镜像，托管在私有域名，不发布二进制资产。

#### 为什么选这些源

v0.1 规划阶段我们评估了每个候选的终末地 wiki / 数据源，按技术可行性筛选：

| 候选 | 结论 | 理由 |
|------|------|------|
| `endfield.wiki.gg` | ✅ 选用 | 标准 MediaWiki 1.43.6，带浏览器风格请求头后 `api.php` 可用。最大的英文终末地 wiki。 |
| `endfield.prts.chat` | ❌ 排除 | 不是 wiki——是个 AI RAG 查询工具。FastAPI 后端无公开 API，探测的所有端点都 404。 |
| `endfield.games`（END Wiki） | ❌ 排除 | 纯 SPA，非 MediaWiki，无可机读 API。 |
| `Variante/endfield_research_kit` | ⚠️ 间接使用 | 本地导出工具包，非数据源。其导出契约（`export_full/structured/StreamingAssets/Table/*.json`）定义了我们镜像将遵循的 schema。明确禁止再分发游戏内容。 |
| `daydreamer-json/ak-endfield-api-archive` | ⚠️ 未来选项 | 每 5 分钟归档一次官方 API 响应。若镜像维护成为负担，可作为 v0.3+ 的备选方案。 |

选型理由记录在此，避免未来贡献者重复讨论。如果你要提议新数据源，请先读这张表。

### 快速开始

**前置条件：** [Bun](https://bun.sh) ≥ 1.2。

```bash
git clone https://github.com/3aKHP/Endfield-MCP.git
cd Endfield-MCP/ts
bun install
```

**本地 stdio（Claude Desktop / Claude Code）：**

```bash
bun run src/server.ts
```

或添加到 MCP 客户端配置（路径在所有平台上都用正斜杠；Windows 上也可以用反斜杠）：

```json
{
  "mcpServers": {
    "endfield": {
      "command": "bun",
      "args": ["run", "/绝对路径/Endfield-MCP/ts/src/server.ts"]
    }
  }
}
```

**远程 HTTP 服务：**

```bash
EF_TRANSPORT=http PORT=3000 bun run src/server.ts
# MCP 端点：http://localhost:3000/mcp  （仅 POST，无状态）
# 健康检查：http://localhost:3000/health
```

### 配置（环境变量）

| 变量 | 默认值 | 取值 | 用途 |
|------|--------|------|------|
| `EF_TRANSPORT` | `stdio` | `stdio` \| `http` | 传输方式选择 |
| `EF_DATA_PATH` | 用户目录 | 绝对路径 | GameData 路径（设置后禁用自动同步） |
| `EF_WIKI_ENDPOINT` | `https://endfield.wiki.gg/api.php` | URL | Wiki API 地址覆盖 |
| `EF_WIKI_UA` | Chrome 风格 UA | 字符串 | Wiki 请求的 User-Agent（WAF 可能拒绝裸 bot） |
| `EF_WIKI_REFERER` | `https://endfield.wiki.gg/` | URL | Wiki 请求的 Referer |
| `PORT` | `3000` | 端口号 | HTTP 监听端口（仅 `http` 模式） |
| `HOST` | `0.0.0.0` | 主机名 | HTTP 监听地址（仅 `http` 模式） |
| `GITHUB_MIRRORS` | （未设置） | 逗号分隔的 URL | ghproxy 风格镜像 URL（不带尾部斜杠） |

### 验证

```bash
cd ts
bun run typecheck                          # TypeScript 零错误
bun test                                   # 单元测试（无网络）
bun run scripts/smoke-live.ts              # 实测 WAF 绕过（真实访问 Wiki——手动运行，不进 CI）
```

或用一键审计脚本：

```powershell
.\scripts\check-runtime.ps1 -Full          # Windows
./scripts/check-runtime.sh --full          # Unix
```

### 相关项目

- [PRTS-MCP](https://github.com/3aKHP/prts-mcp) —— 明日方舟本体的姊妹 MCP Server，本项目架构蓝本。
- [Variante/endfield_research_kit](https://github.com/Variante/endfield_research_kit) —— 终末地本地数据导出工具包，定义了我们 GameData 镜像将遵循的 schema。
- [Endfield Talos Wiki](https://endfield.wiki.gg) —— 本项目 Wiki 数据来源。

### 开发文档

- [`AGENTS.md`](AGENTS.md) —— AI 协作者启动手册（运行时环境、启动准则、已知陷阱）
- [`docs/dev/WORKFLOW.md`](docs/dev/WORKFLOW.md) —— 开发工作流（分支模型、迭代循环、独立 CR、版本同步）
- [`docs/dev/STYLE.md`](docs/dev/STYLE.md) —— 代码规范与架构硬原则
- [`STATUS.md`](STATUS.md) —— 项目现状与工具清单
- [`ROADMAP.md`](ROADMAP.md) —— 路线图与版本规划

---

## License

MIT
