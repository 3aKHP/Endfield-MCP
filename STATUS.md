# EndField-MCP 项目状态

_Last updated: 2026-06-22_

## 当前版本

| 实现 | 版本 | 状态 |
|------|------|------|
| TypeScript（Bun） | 0.3.0 | 首个正式发版（Wiki + 角色档案/语音/数值 + 剧情文本），157 单测全绿 |

- 当前工具：15 个（6 Wiki + 5 Character + 4 Story）
- 单实现：仅 TypeScript / Bun（不搞双实现——TS 一套覆盖 stdio + HTTP）
- 兼容性预期：1.0 前工具名/必填参数可变；1.0 后冻结（参考 PRTS-MCP 政策）

## 当前分支

- `main` — v0.3.0（含 v0.1 骨架 + v0.2 GameData 基础设施 + v0.3 创作工具，tag `v0.3.0`）
- `dev` — 与 main 同步，作为下一个版本的工作分支

## 数据源

| 数据源 | 用途 | 接入方式 | 状态 |
|--------|------|----------|------|
| [endfield.wiki.gg](https://endfield.wiki.gg/api.php) | 世界观词条、阵营设定 | 实时 HTTP（浏览器 UA + Referer 绕 WAF） | ✅ v0.1 |
| [3aKHP/EndFieldGameData](https://github.com/3aKHP/EndFieldGameData) `endfield-tables.zip` | 角色数值/敌人/装备/物品表格 + 5 语言本地化 | GitHub Release zip（自动同步 + 镜像级联 + bundled 兜底） | ✅ v0.2.0 |
| [3aKHP/EndFieldGameData](https://github.com/3aKHP/EndFieldGameData) `endfield-story-CN.zip` | 剧情对话场景（9271 个场景，CN 全文本） | GitHub Release zip（自动同步，按需读 conv 文件） | ✅ v0.3.0 |

Wiki 内容以英文为主；调用方 LLM 负责桥接到用户语言。GameData 支持中文/英文/日文/繁中/韩文五种语言，工具描述与项目文档使用中文。

## 工具清单 (15, current branch)

| # | 工具 | 数据源 | 版本 |
|---|------|--------|------|
| 1 | `ef_search_wiki` | endfield.wiki.gg | 0.1.0 |
| 2 | `ef_read_wiki_page` | endfield.wiki.gg | 0.1.0 |
| 3 | `ef_list_wiki_sections` | endfield.wiki.gg | 0.1.0 |
| 4 | `ef_get_wiki_categories` | endfield.wiki.gg | 0.1.0 |
| 5 | `ef_get_wiki_links` | endfield.wiki.gg | 0.1.0 |
| 6 | `ef_get_wiki_template` | endfield.wiki.gg | 0.1.0 |
| 7 | `ef_get_character_archives` | EndFieldGameData tables | 0.3.0 |
| 8 | `ef_get_character_voices` | EndFieldGameData tables | 0.3.0 |
| 9 | `ef_get_character_basic_info` | EndFieldGameData tables | 0.3.0 |
| 10 | `ef_list_characters` | EndFieldGameData tables | 0.2.0 |
| 11 | `ef_search_characters` | EndFieldGameData tables | 0.2.0 |
| 12 | `ef_list_story_chapters` | EndFieldGameData story | 0.3.0 |
| 13 | `ef_list_stories` | EndFieldGameData story | 0.3.0 |
| 14 | `ef_read_story` | EndFieldGameData story | 0.3.0 |
| 15 | `ef_search_stories` | EndFieldGameData story | 0.3.0 |

## 仓库结构

```
EndFiled-MCP/
├── ts/                          # 唯一实现
│   ├── src/
│   │   ├── server.ts            # 入口：按 EF_TRANSPORT 选 stdio / http
│   │   ├── config.ts            # env 解析、路径优先级
│   │   ├── startupSync.ts       # 同步编排（单飞锁 + 重试退避）
│   │   ├── api/
│   │   │   ├── endfieldWiki.ts  # MediaWiki 客户端（WAF 头 + 速率限制）
│   │   │   └── parsetreeParser.ts # parsetree XML 解析（独立纯函数）
│   │   ├── data/
│   │   │   ├── stores.ts        # JsonStore 抽象（含 int64-safe 解析）
│   │   │   ├── sync.ts          # GitHub Release 同步（cascade + TTL + fallback）
│   │   │   ├── datasets.ts      # 数据集 spec（10 表 + 5 语言）
│   │   │   ├── texts.ts         # 本地化查询层（int64 哈希 → 实际文本）
│   │   │   ├── characterTable.ts # 角色表 cache + resolver（bind/clear/resolve）
│   │   │   ├── characterEnums.ts # 职业/属性/武器 中文名映射（纯数据）
│   │   │   ├── characters.ts    # 角色 operations facade（list/get/search）
│   │   │   ├── characterProfiles.ts # 角色档案 + 语音 reader
│   │   │   ├── storyCore.ts     # 剧情 store 绑定 + 目录加载
│   │   │   ├── storyChapters.ts # 章节推导 + 列表
│   │   │   ├── storyScenes.ts   # 单场景按需读取 + 行归一化
│   │   │   ├── storySearch.ts   # 全文检索（search.json 索引）
│   │   │   ├── story.ts         # 剧情 barrel facade + 生命周期编排
│   │   │   └── storyTypes.ts    # 剧情 public 类型
│   │   ├── tools/
│   │   │   ├── wikiTools.ts     # 6 个 ef_ Wiki 工具注册
│   │   │   ├── gamedataTools.ts # 5 个 ef_ GameData 工具注册（角色档案/语音/数值/list/search）
│   │   │   ├── storyTools.ts    # 4 个 ef_ Story 工具注册
│   │   │   └── toolRuntime.ts   # 共享错误处理（withGracefulError）
│   │   ├── transports/
│   │   │   ├── stdio.ts         # StdioServerTransport 封装
│   │   │   └── http.ts          # Stateless Streamable HTTP（Bun.serve）
│   │   └── utils/
│   │       └── sanitizer.ts     # wikitext 清洗
│   ├── tests/                   # bun:test（157 测试全绿）
│   ├── scripts/
│   │   ├── build-mirror-zip.ts  # 镜像 tables zip 打包（正斜杠 entry）
│   │   ├── build-story-zip.ts   # 镜像 story zip 打包
│   │   ├── fetch-bundled-data.ts # CD 用：从 GitHub Release 拉 bundled 数据
│   │   ├── smoke-live.ts        # live WAF 绕过验证（Wiki）
│   │   ├── smoke-gamedata.ts    # live 角色数值 reader 验证
│   │   ├── smoke-sync.ts        # live 镜像同步验证
│   │   ├── smoke-bundled-fallback.ts # 三层 fallback 验证
│   │   └── smoke-creation.ts    # live 档案/语音/剧情 验证
│   ├── package.json             # type: module, Bun scripts
│   ├── tsconfig.json
│   └── CHANGELOG.md
├── docs/
│   ├── dev/
│   │   ├── STYLE.md             # 代码规范与架构硬原则
│   │   └── WORKFLOW.md          # 开发工作流（分支/CR/版本同步）
│   └── admin/
│       └── mirror-release-workflow.md # 镜像仓库 CI 设计草稿
├── scripts/
│   ├── check-runtime.ps1        # Windows 环境审计
│   └── check-runtime.sh         # Unix 环境审计
├── .github/workflows/
│   ├── ci.yml                   # Bun test + typecheck + build（Linux + Windows 矩阵）
│   └── cd.yml                   # tag 触发：fetch bundled + npm publish
├── AGENTS.md                    # AI 协作说明（运行时/环境）
├── STATUS.md                    # 本文件
├── ROADMAP.md                   # 路线图
└── README.md                    # 面向用户的说明
```

## 验收状态（v0.3.0）

| 检查项 | 结果 |
|--------|------|
| `bun install` | ✅ |
| `bun run typecheck` | ✅ 零错误 |
| `bun test` | ✅ **157/157 通过** |
| `bun run build`（tsc emit） | ✅ dist 完整 |
| stdio transport | ✅ 15 工具全部注册 |
| HTTP transport | ✅ `/health`、`/mcp POST`（SSE）、`GET`（405） |
| live WAF 绕过（Wiki） | ✅ `ef_search_wiki("Endfield")` 真实结果 |
| live GameData reader | ✅ 角色档案/语音/数值正确解析（CN/EN 名 + 四语言 CV） |
| live Story reader | ✅ 9271 场景目录加载，conv 按需读取 |
| **live 镜像同步** | ✅ tables + story 双 Release 自动同步 |
| int64 精度处理 | ✅ `-7078064683023630592` → "管理员" 正确解析 |
| 多语言切换 | ✅ 同一角色 CN/EN/JP/TC/KR 五语言名全部正确 |
| **生产部署** | ✅ `mcp.4sljq.top/endfield/mcp`（5111，走 mihomo 代理） |

## 已知遗留

技术债（详见 ROADMAP Patch Line）：

- [x] npm Trusted Publishing 迁移 — dev 已配置（PR #7，cd.yml OIDC + Node 22），**待首次实发布验证**
- [x] `ef_search_characters` 缺 `.max(200)` ReDoS 防护 — dev 已修（PR #5）
- [x] Story bundled data 未进 npm 包 — dev 已修（PR #6）
- [ ] Mirror CI workflow 未实装（`docs/admin/mirror-release-workflow.md` 有设计草稿；PR #8 补齐消费侧契约，仓库 CI 实装待 self-hosted runner）

代码债务：

- [ ] `SCHEMA_TODO` 残留（datasets.ts + startupSync.ts，待 mirror schema 最终确认后清理）
- [ ] `characterProfiles.ts` 的 `LocalizedField` 与 `texts.ts` 的 `LocalizedText` 类型重复（语义等价，待统一）
- [ ] `characterEnums.ts` 的三个枚举映射是硬编码（已对齐真实数据验证，但理想情况应从 `CharProfessionTable`/`CharTypeTable` 动态读取）
