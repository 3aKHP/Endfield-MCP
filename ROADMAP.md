# Endfield-MCP Roadmap

_Last updated: 2026-06-29_

Endfield-MCP is pre-1.0. This document tracks **what comes next**. For
shipped features, see the TypeScript CHANGELOG (`ts/CHANGELOG.md`).

## Current Release

- TypeScript: `0.3.1` — tech-debt cleanup (story bundled fallback, npm Trusted Publishing, mirror contract, ReDoS hardening)
- 15 public MCP tools (6 Wiki + 5 Character + 4 Story)
- 157 unit tests passing
- Single implementation: TypeScript / Bun
- Production deployment: `mcp.4sljq.top/endfield/mcp` (走 mihomo 代理)
- See `STATUS.md` for the verification matrix

## 1.0 Compatibility Contract

**1.0 之前**（当前）：工具名、必填参数、返回格式均**可能变化**。不做
兼容承诺。早期使用者应预期 breakage，跟随 CHANGELOG 升级。

**1.0 之后**：以下成为兼容契约，minor/patch 不得破坏：

- 全部 `ef_*` 工具名
- 全部必填参数的名称与类型
- 返回的 markdown 结构形态（字段可增，不可删/改语义）
- 环境变量契约（`EF_TRANSPORT`、`PORT`/`HOST`、`HTTPS_PROXY`）

**1.x 允许的增量变更**（不破坏契约）：

- 新增工具（additive）
- 新增可选参数（带安全默认值）
- 新增可选数据源 / fallback 层
- 同一格式内的内容增强

## Decision Principles

1. **叙事素材优先于游戏机制** — Endfield 的同人创作场景核心是人物与
   故事，而非数值配队。Worldbuilding、角色日常、关系系统优先于
   Items/Stages/Enemies 等机制域。
2. **一个 minor 承载一个主数据域** — 便于沟通、迁移、回滚。跨源融合
   工具（如 stage-enemy）随其数据依赖的 minor 一起发布或更晚。
3. **Patch 不扩展能力面** — bug 修复、文档、基建、以及语义已被现有
   工具覆盖的合并别名。新工具在 minor 发布。
4. **领先 breakage 一个版本** — 1.0 的工具名冻结是契约；2.0 计划的
   破坏性变更（output_format 翻转、别名移除）在 1.x 全程准备，而非
   最后一刻宣布。
5. **单实现是特性而非限制** — 只发 TypeScript/Bun（无 Python 兄弟），
   消除 PRTS-MCP 承担的对等债。新能力必须适配单实现模型。
6. **按 schema 形态合并，不按域合并** — 工具面增长到挤压上下文预算时
   （预计 2.0），合并共享参数结构/输出长度的工具；保留语义真正不同的。

## Minor Release Plan

每个 minor 承载一个主数据域。版本顺序按同人创作价值排序，可能根据
self-hosted mirror 实际落地情况调整。

### 0.4 — Worldbuilding（世界观素材）

Endfield 的核心世界观入口，目前完全不可访问。

**数据源**（需扩展 `TABLE_FILES` + 重新发镜像 Release）：

- `Prts*.json`（~10 表）— 游戏内 PRTS 档案系统：文档、页面、笔记、
  调查记录、分类
- `WikiEntry*.json` + `WikiCategory*.json` + `WikiGroupTable.json` —
  游戏内百科/百科全书

**工具**：

- `ef_search_lore(pattern, category?)` — 全文检索世界观文档
- `ef_read_lore_document(doc_id)` — 读取单个文档全文
- `ef_list_lore_categories()` — 列出世界观分类
- `ef_get_wiki_entry(entry_id)` — 读取百科词条

### 0.5 — Character Life（角色日常）

角色性格的非战斗表达，同人创作的对话素材金矿。

**数据源**：

- `SNSChatTable.json` / `SNSDialogTable.json` / `SNSDialogOptionTable.json`
  / `SNSDialogTopicTable.json` — 游戏内"社交/通讯"应用的角色的对话
- `DialogTextTable.json` + `DialogOptionTable.json` + `EnvTalkTable.json`
  — 独立对话文本 + 环境对话触发
- `NpcTable.json` / `NpcInfoTable.json` — 具名 NPC

**工具**：

- `ef_get_character_sns(char_id)` — 角色的 SNS 聊天记录
- `ef_search_dialog(pattern, speaker?)` — 跨对话全文检索
- `ef_list_npcs()` / `ef_get_npc_info(name)` — NPC 浏览/查询

### 0.6 — Relationships & Factions（角色深度 + 阵营）→ 1.0 冻结

角色关系网与阵营归属。此处冻结 1.0——此时工具数预计 25-30，创作向
工具形态已收敛。

**数据源**：

- `SpaceshipCharRelationLevelTable.json` / `SpaceshipCharRelationNeedMap.json`
  — 角色关系等级
- `SpaceshipClueData*.json` — 角色线索（世界观揭示）
- `SpaceshipSubCharGiftTable.json` / `SpaceshipCharGiftGainRatio.json` —
  礼物偏好
- `BlocDataTable.json` — 阵营/势力（解决 `CharacterTable.department`
  当前是 opaque 字段的问题）

**工具**：

- `ef_get_character_relationships(char_id)` — 角色关系网
- `ef_get_character_clues(char_id)` — 角色线索/档案
- `ef_get_gift_guide(char_id)` — 礼物偏好指南
- `ef_list_factions()` / `ef_get_faction_info(name)` — 阵营浏览

### 1.0 — Surface Freeze

- 公开工具名 + 必填参数成为兼容契约（见上方 Compatibility Contract）
- CHANGELOG 建立，版本 tag 落地（`v1.0.0`）
- 如有 0.x 工具形态调整，发布迁移说明

### 1.x — Game Mechanics（游戏机制域，1.0 后增量）

创作向域冻结后，补充游戏机制域。这些数据价值较低但覆盖面广。

- **Items / Equipment** — `ItemTable.json` + `EquipTable.json` 已在镜像
  同步，无需重发。`ef_list_items` / `ef_get_item_info` / `ef_search_items`
- **Stages / Dungeons** — `DungeonTable.json` 系列。`ef_list_stages` /
  `ef_get_stage_info`
- **Enemies** — `EnemyTable.json` 已同步。`ef_list_enemies` /
  `ef_get_enemy_info` + stage-enemy 跨源融合

## Patch Line (0.3.x)

Patches 只做 bug 修复、基建、不扩展能力面。

| 版本 | 主题 | 内容 |
|------|------|------|
| **0.3.1** | 技术债清理 | (1) ⏳ npm Trusted Publishing 迁移（PR #7，dev 已配置，待首次实发布验证）——npm 侧配 trusted publisher，cd.yml 加回 `--provenance` + Node 22（OIDC 要求 npm ≥ 11.5.1），去掉 NPM_TOKEN；(2) ✅ S7: `ef_search_characters` 加 `.max(200)` ReDoS 防护（PR #5）；(3) ✅ Story bundled data（PR #6）——19MB story bundle 进 npm 包，离线兜底；(4) ⏳ Mirror CI workflow——本仓库消费侧契约补齐（PR #8），EndFieldGameData 仓库的自动重导出 GitHub Actions 待 self-hosted runner |
| 0.3.2（保留） | 体验优化 | 工具描述关键词优化（提升客户端 RAG 召回）/ 分页标准化 `{total, offset, limit, items}` / 结构化错误 `{error_code, message}` |

> **ReDoS 防护的现实边界**：S7 的 `.max(200)` 字符上限是对两个正则接受工具（`ef_search_characters` / `ef_search_stories`）的**输入复杂度边界**，缓解最常见的长模式注入。它**不消除** ReDoS——短病态模式（如 `^(a?){20}a{20}$` 仅 16 字符）仍可触发指数级回溯。若未来需要真正的 ReDoS 免疫，需在 data 层引入非回溯引擎或显式复杂度检查。当前方案是与现有 story 工具对齐的基线防护。

## 2.0 Boundary（not before 1.x matures）

2.0 是 major bump，**三个触发条件全部满足**前不考虑：

1. 工具面增长到挤压 128K 模型的上下文预算（PRTS-MCP 在 ~30 工具时
   触发；我们的阈值相近）。
2. 至少有一个破坏性变更真正需要，且无法通过新增可选参数推迟。
3. 1.x 已稳定足够多的版本，major bump 不会困住用户。

**保留的 2.0 议题**：

- 按 schema 形态合并工具面（PRTS-MCP 2.0 计划——合并共享参数结构/
  输出长度的工具）。
- `output_format=markdown|json` 选择器，staged default flip（1.x 默认
  markdown，2.0 翻转为 json）——这是唯一的破坏性变更。
- 待社区托管的 GameData 源出现后，重新评估是否迁移。

## Non-Goals

- **不做**全表覆盖——从 ~500 个导出表里挑选对同人创作有用的子集。
- **不做**在 npm 包内嵌入大体量 fallback 数据（除 tables 兜底外；
  story bundled data 是有意为之的例外）。
- **不做**多语言 wiki 支持（endfield.wiki.gg 是英文；靠调用方 LLM
  桥接语言）。
- **不做**在进程内重新实现 endfield_research_kit 导出器。我们消费
  其输出，不运行它。
- **不做**Python + TypeScript 双实现。单 TS 决策对本项目是终局。
