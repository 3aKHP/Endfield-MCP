# EndField-MCP Roadmap

_Last updated: 2026-06-22_

EndField-MCP is pre-1.0. This document tracks **what comes next**. For
shipped features, see the TypeScript CHANGELOG (once established).

## Current Release

- TypeScript: `0.2.0-dev.0` (GameData domain in progress on `feat/v0.2.0-gamedata-skeleton`, not yet tagged)
- 9 public MCP tools (6 Wiki + 3 GameData/characters)
- Single implementation: TypeScript / Bun
- See `STATUS.md` for the verification matrix

## Design Principles

Inherited from PRTS-MCP and adapted to EndField's single-implementation reality:

1. **One data domain per minor release** — easier to communicate, migrate, and roll back. Each minor ships exactly one main data domain (characters, items, stages, enemies, story).
2. **Patches don't add new capability surface** — bug fixes, docs, infra only. New tools ship in minor releases. Patches may introduce consolidation aliases whose semantics are already covered by existing tools, never a genuinely new capability.
3. **Bind cross-source fusion to its data dependency** — don't ship a "stage enemies" tool before the "stage" domain exists.
4. **Consolidate by schema shape, not by domain** — when the tool surface grows large enough to pressure context budgets (likely 2.0), merge tools that share parameter structure and output length; keep tools whose semantics genuinely differ.
5. **Lead breaking changes by a release** — 1.0's tool-name freeze is the contract; nothing before then is stable. 2.0's planned breaks (output_format flip, alias removal) are prepared throughout 1.x, not announced at the last minute.
6. **Single implementation is a feature, not a limitation** — the decision to ship only TypeScript/Bun (no Python sibling) is final. It eliminates the parity debt PRTS-MCP carries. New capability must fit the single-implementation model; do not propose reintroducing a second language.

## Minor Release Plan

Each minor version carries one main data domain. The version sequencing may
shift based on what the self-hosted mirror actually lands first.

### 0.1 — Skeleton + Wiki MVP (code complete, unreleased)

Code finished and verified end-to-end (see `STATUS.md` verification matrix), but no git tag yet. The `0.1.0` tag is cut at the first real release after `git init` + initial commit.

- Project scaffold: Bun + TS + MCP SDK
- 6 Wiki tools (`ef_search_wiki`, `ef_read_wiki_page`,
  `ef_list_wiki_sections`, `ef_get_wiki_categories`,
  `ef_get_wiki_links`, `ef_get_wiki_template`)
- stdio + Streamable HTTP stateless transports
- Store abstraction layer (Directory / Zip / Fallback) — data-layer ready,
  no consumers yet
- WAF-bypass wiki client against endfield.wiki.gg
- CI + runtime audit scripts

### 0.2 — GameData Domain (Mirror + First Tables) — in progress

The first dependency on the self-hosted mirror. Schema pinned to the
endfield_research_kit `export_full/structured/StreamingAssets/Table/`
contract (text-only JSON, no binary assets).

- ✅ **Mirror repository** live at [3aKHP/EndFieldGameData](https://github.com/3aKHP/EndFieldGameData), v0.2.0 Release published (10 tables + 5 langs, 23MB)
- ✅ `startupSync.ts` real implementation (single-flight, retry/backoff, cache-clearing cascade)
- ✅ `data/sync.ts` — GitHub Release sync with cascade fallback, TTL cache, atomic write
- ✅ `data/texts.ts` — i18n resolution layer (int64-safe, 5 languages)
- ✅ `data/characters.ts` — character reader (list/get/search, multilingual)
- ✅ Three character tools live: `ef_list_characters` / `ef_get_character_info` / `ef_search_characters`
- ✅ int64 precision handling (`readJsonInt64Safe`) — Endfield's localization ids exceed JS `MAX_SAFE_INTEGER`
- ⏳ Mirror repository CI workflow (design in `docs/admin/`, not yet implemented)
- ⏳ Branch `feat/v0.2.0-gamedata-skeleton` pending PR merge to `dev`

Key discovery during implementation: Endfield separates values from localization. Tables store `{id, text}` objects where `text` is empty and `id` is an int64 hash; the actual string lives in `I18nTextTable_<LANG>.json` under that hash. The `data/texts.ts` module owns that lookup, keeping readers ignorant of which language is active.

### 0.3 — Items + Stages

- `ef_list_items(category?)` / `ef_get_item_info(name)` / `ef_search_items(pattern)`
- `ef_list_stages(chapter?, type?)` / `ef_get_stage_info(stage_id)` / `ef_search_stages(pattern)`
- Item category taxonomy + stage zone table readers

### 0.4 — Enemies

- `ef_list_enemies()` / `ef_get_enemy_info(name)` / `ef_search_enemies(pattern)`
- Stage-enemy fusion (mirrors PRTS-MCP 1.6.0):
  `ef_get_stage_enemies(stage_id)`, `ef_get_enemy_appearances(name)`

### 0.5 — Story / Lore

Depends on a story-JSON source. Endfield has no ArknightsStoryJson
equivalent yet — either we mirror the endfield_research_kit story builder
output or partner with a community source.

- `ef_list_story_events(category?)` / `ef_list_stories(event_id)`
- `ef_read_story(story_key)` / `ef_get_event_summary(event_id)`
- `ef_search_stories(pattern, character?, line_type?)`

### 1.0 — Surface Freeze

- Public tool names + required parameters become a compatibility contract
- CHANGELOG established, version tag dropped (`v1.0.0`)
- Migration notes published if any 0.x tool changed shape

## Patch Line (0.x.y)

| Tentative | Theme | Scope |
|-----------|-------|-------|
| 0.1.1 | Docker image | Bun-based Dockerfile, CI publishes image |
| 0.1.2 | npm publish | First public `endfield-mcp` package on npm |
| 0.1.3 | Tool description optimization | Keyword-rich descriptions for client-side tool RAG |
| 0.2.x | Mirror infra hardening | Cache TTL, mirror cascade, offline fallback polish |

## 2.0 Boundary (not before 1.x matures)

2.0 is a major bump and won't be considered until **all three** triggers fire:

1. The tool surface grows large enough to pressure context budgets for 128K-class models (PRTS-MCP hit this around 30 tools; our threshold is similar).
2. At least one breaking change is genuinely needed and can't be deferred via additive parameters.
3. 1.x has been stable for enough releases that a major bump won't strand users.

Reserved 2.0 topics:

- Tool-surface consolidation by schema shape (the PRTS-MCP 2.0 plan — merge tools that share parameter structure and output length).
- `output_format=markdown|json` selector with staged default flip (markdown default in 1.x, flip to json in 2.0).
- Re-evaluating whether GameData should move to a community-hosted source once one emerges.

## Non-Goals

- Shipping every Endfield data table — pick what's useful for fan creation.
- Embedding large fallback data in the npm package.
- Multi-language wiki support (endfield.wiki.gg is English-only; we rely on
  the calling LLM to bridge languages).
- Re-implementing the endfield_research_kit exporter in-process. We consume
  its output via the mirror, not run it.
- Supporting both Python and TypeScript implementations. The single-TS
  decision is final for this project.
