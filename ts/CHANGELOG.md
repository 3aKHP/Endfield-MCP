# Changelog

All notable changes to Endfield-MCP (TypeScript implementation) are recorded
here. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

No changes yet.

## [0.3.1] — 2026-06-29 — Tech-debt cleanup

### Added

- **Story bundled fallback**: the build-time `fetch-bundled-data.ts` script now also downloads `endfield-story-CN.zip` (extracting into `data/endfield/story/`), so the npm package ships the story bundle as an offline fallback alongside the tables bundle. Previously only tables were bundled — story tools had no offline fallback despite the runtime store wiring (`FallbackStore` with a bundled layer) being in place since v0.3.0. The CD pipeline now verifies `data/endfield/story/index.json` is populated before packing.

### Changed

- **Project rename `EndField`/`EndFiled` → `Endfield`**: corrected the project name to match the official game spelling (Arknights: **Endfield**). Two wrong forms had proliferated since the repo's creation — a transposed-character typo `EndFiled` (the GitHub repo name + derived git URLs, package.json metadata) and a non-canonical capitalization `EndField` (~35 doc/comment/runtime-string occurrences). All unified to `Endfield-MCP`. The npm package name `endfield-mcp`, all `endfield` runtime data paths, and the separate `EndFieldGameData` mirror repo are unchanged (correct or out of scope). Two runtime strings updated: the GitHub-sync User-Agent (`sync.ts`) and the server startup log line (`server.ts`).
- **npm Trusted Publishing**: CD now publishes with `--provenance` and authenticates via GitHub Actions OIDC instead of a long-lived `NPM_TOKEN` secret. The `NODE_AUTH_TOKEN` env binding is removed; npm trust is established through the Trusted Publisher configured on the npm package. `setup-node` is bumped to Node 22 — Trusted Publishing's OIDC token-exchange flow requires npm ≥ 11.5.1, which only ships with Node ≥ 22.14.0 (Node 20's npm 10.x has no OIDC support and fails with ENEEDAUTH). `id-token: write` was already present (declared for provenance in v0.2.0 but unused until now).
- **Mirror contract doc** (`docs/admin/mirror-release-workflow.md`): rewritten from a speculative design draft into a locked consumer-side contract — documents the published zip structures (tables + story), version-numbering policy, and the current manual-export reality, with the self-hosted-runner automation deferred. Three stale `SCHEMA_TODO` comments (`datasets.ts`, `startupSync.ts` ×2) plus one related stale placeholder (`config.ts`) replaced with declarative notes (the mirror is live, requiredFiles are pinned, readers landed in v0.2/v0.3).

### Fixed

- `ef_search_characters` now caps `pattern` at 200 characters (ReDoS hardening), aligning with `ef_search_stories`. Previously only the story tool enforced the limit.

## [0.3.0] — 2026-06-22 — Creation-oriented tools

### Added

- **Character archives**: `ef_get_character_archives` — returns a character's background-story text (3 sections: basic profile / personnel summary / archive material). Data source: CharacterTable.profileRecord. Rich-text tags (`<@...>`, `<#...>`, `</>`) stripped by cleanProfileText.
- **Character voices**: `ef_get_character_voices` — returns voice line text with trigger conditions (55-79 lines per character). Data source: CharacterTable.profileVoice.
- **Story domain** (4 tools): `ef_list_story_chapters` (364 chapters), `ef_list_stories` (scenes within a chapter), `ef_read_story` (full dialogue scene), `ef_search_stories` (full-text search across 9271 scenes). Data source: `endfield-story-CN.zip` (v0.3.0 Release on EndFieldGameData, 19MB).
- **Story data reader** (`data/story.ts`): catalog (index.json) loads eagerly; conv/ files load on-demand per scene read. Chapter derivation via mission-id prefix grouping. Search via pre-built search.json index.
- **Character profile reader** (`data/characterProfiles.ts`): archives + voices projection with rich-text cleaning.
- **Story types** (`data/storyTypes.ts`): StoryLine (dialog/narration/choice), StoryEntry, StoryChapter, StoryScene.
- **Mirror**: `endfield-story-CN.zip` published as v0.3.0 Release on 3aKHP/EndFieldGameData (9275 files, 19MB).
- **Build script**: `build-story-zip.ts` for packing story bundle with forward-slash entry names.
- **Smoke test**: `smoke-creation.ts` for live verification of archives/voices/story tools.

### Changed

- **Character tool surface refactored** to PRTS-MCP three-way split: deleted `ef_get_character_info` (numeric-biased), added `ef_get_character_archives` (story text), `ef_get_character_voices` (voice lines), `ef_get_character_basic_info` (numeric info, renamed from the deleted tool's projection). Matches PRTS-MCP's get_operator_archives / get_operator_voicelines / get_operator_basic_info design.
- `characters.ts`: extracted `resolveCharacterEntry()` from `getCharacterInfo()` so characterProfiles.ts reuses the same id/CN-name/EN-name lookup.
- `startupSync.ts`: added STORY_CN dataset sync (own runner, own retry, clearStoryCaches on update).
- `server.ts`: story store always constructed unconditionally via FallbackStore (matching GameData pattern — never gate binding on directory existence, or background sync data is permanently missed).
- `datasets.ts`: added STORY_CN ReleaseDatasetSpec.
- `withGracefulError` extracted to shared `tools/toolRuntime.ts` (was duplicated in gamedataTools + storyTools).
- Version bumped to 0.3.0 (first public release).

### Fixed

- `cleanProfileText` now strips `<#...>` tag family (870+ i18n values use these status/effect tags), not just `<@...>`. Addresses CR #2 S3.
- Story conv files parsed with `readJsonInt64Safe` (defensive — conv line `id` fields are int64-sized). Addresses CR #2 S4.
- `searchStories` caches the 9271-entry key→entry Map at module level instead of rebuilding on every call. Addresses CR #2 S6.
- Story store bound unconditionally at startup (was gated on directory existence — a regression that would permanently miss background-synced data). Addresses CR #2 B1.

## [0.2.0] — 2026-06-22 — GameData domain

### Added

- **GameData domain**: three new `ef_` tools over the Endfield character table.
  - `ef_list_characters(lang?)` — 29 characters with resolved names, profession, rarity, charType, department.
  - `ef_get_character_info(id_or_name, lang?)` — full detail including 4-language CV names.
  - `ef_search_characters(pattern, max_results?, lang?)` — regex search across names, id, profession, charType, department.
- **Self-hosted mirror** ([3aKHP/EndFieldGameData](https://github.com/3aKHP/EndFieldGameData)): v0.2.0 Release published with `endfield-tables.zip` (10 core tables + 5 localization languages, 23MB).
- **Auto-sync** (`data/sync.ts`): GitHub Release sync with cascade fallback (`GITHUB_MIRRORS`), TTL cache, atomic write, offline fallback to cached data. Hash comparison skips download when release tag unchanged.
- **Bundled fallback** (three-tier availability): `fetch-bundled-data.ts` build-time script populates `ts/data/endfield/`; `server.ts` wires `FallbackStore(primary=synced, fallback=bundled)`; CD pipeline (`.github/workflows/cd.yml`) injects bundled data before npm publish.
- **i18n resolution layer** (`data/texts.ts`): Endfield separates values from localization — tables store `{id, text}` where `text` is empty and `id` is an int64 hash. This module owns the hash→string lookup across CN/EN/JP/TC/KR.
- **int64-safe JSON parsing** (`stores.ts:readJsonInt64Safe`): Endfield's localization ids exceed `Number.MAX_SAFE_INTEGER`; plain `JSON.parse` silently truncates them. String-aware preprocessor wraps large integer literals in quotes before parsing.
- **Character reader** (`data/characters.ts`): list/get/search projections with profession/rarity/charType/weaponType enum mapping and CV resolution.
- **Sync orchestration** (`startupSync.ts`): single-flight locking, exponential backoff retries (30s/120s/600s), cache-clear cascade on successful refresh.
- **CD pipeline** (`.github/workflows/cd.yml`): tag-triggered, fetches bundled data → npm publish.
- **Build/deploy scripts**: `fetch-bundled-data.ts`, `build-mirror-zip.ts` (forward-slash-enforcing packer), three smoke tests (`smoke-live`/`smoke-gamedata`/`smoke-sync`/`smoke-bundled-fallback`).
- **Tests**: +24 (8 int64-safe parsing, 16 character reader). Total 90/90.

### Changed

- `server.ts` version bumped to `0.2.0-dev.0`; binds text store before character store (dependency order); builds FallbackStore based on which data directories exist.
- `startupSync.ts` is no longer a no-op — real implementation with single-flight + retry + cache clearing.
- `.gitignore`: replaced stale PRTS-MCP entries (`gamedata/`, `storyjson/`) with Endfield-specific rules.

### Fixed

- `parseInt64Safe` rewritten to be string-aware (numbers inside JSON string values are no longer corrupted), unbounded digit length (20+ digit literals no longer produce invalid JSON), and float-safe (numbers with `.` or exponent are skipped). Addresses CR #1 B1+B2.
- `startupSync.ts` now calls `clearTextCaches()` + `clearCharacterCaches()` after a successful background refresh. Previously stale data was served until process restart. Addresses CR #1 B3.
- `texts.ts:loadLanguageIndex` uses `readJsonInt64Safe` instead of `readJson` for defense-in-depth against future i18n key format changes. Addresses CR #1 B4.

## [0.1.0] — 2026-06-22 — Skeleton

### Added

Initial project skeleton. End-to-end working Wiki MVP, no GameData domain
yet.

- **Project scaffold**: Bun + TypeScript + MCP SDK project layout with
  strict TS, ESM, NodeNext module resolution.
- **6 Wiki tools** (`ef_` prefix):
  - `ef_search_wiki(query, limit?, search_mode?, filter_technical?)`
  - `ef_read_wiki_page(page_title, section_index?)`
  - `ef_list_wiki_sections(page_title)`
  - `ef_get_wiki_categories(page_title)`
  - `ef_get_wiki_links(page_title, direction?, limit?)`
  - `ef_get_wiki_template(page_title)`
- **Dual transport**: stdio (default, `StdioServerTransport`) and Streamable
  HTTP stateless (`WebStandardStreamableHTTPServerTransport` over
  `Bun.serve`). Selected via `EF_TRANSPORT` env var.
- **Wiki client** (`api/endfieldWiki.ts`): MediaWiki API client with
  built-in WAF bypass (browser UA + Referer + Accept headers), 1.5s rate
  limiter, and parsetree XML parser for template extraction.
- **Store abstraction** (`data/stores.ts`): `JsonStore` interface with
  `DirectoryStore`, `ZipStore`, `FallbackStore` implementations. Path-safety
  invariants (rejects absolute paths, `..` traversal, leading `/`).
- **Config layer** (`config.ts`): env-driven configuration with path
  priority (Docker volume → per-user dir → bundled fallback).
- **Test suite**: 53 tests across stores, sanitizer, config, wiki client
  (mocked fetch). Zero network dependencies in `bun test`.
- **CI**: GitHub Actions workflow (`.github/workflows/ci.yml`) running
  typecheck + test + build on Linux + Windows, Bun 1.3.
- **Runtime audit scripts**: `scripts/check-runtime.{ps1,sh}` for
  cross-platform environment verification.
- **Live smoke test**: `ts/scripts/smoke-live.ts` for manual WAF-bypass
  verification against endfield.wiki.gg (not part of `bun test`).
- **Docs**: README (bilingual), AGENTS.md, STATUS.md, ROADMAP.md,
  `docs/dev/STYLE.md`.

### Architecture decisions

- **Single TS implementation** (no Python sibling). Rationale: PRTS-MCP's
  dual implementation was driven by Python's asyncio friction with
  Streamable HTTP; Bun+TS handles both transports natively, eliminating
  that motivation.
- **Bun runtime** (not Node). Official MCP SDK first-class support;
  native `fetch`, native `Bun.serve`, native `bun:test`.
- **Stateless HTTP transport** (no session tracking). Endfield-MCP has no
  per-session state, so stateless is strictly simpler than PRTS-MCP's
  session-pooled approach with no capability loss.
- **Wiki source: endfield.wiki.gg**. Verified MediaWiki 1.43.6 with live
  `api.php` access (requires WAF bypass headers). endfield.prts.chat and
  endfield.games were evaluated and rejected (RAG tool and pure SPA
  respectively; neither is a wiki nor has a usable API).
- **GameData: self-hosted mirror** (planned for v0.2). Will mirror only
  text-only JSON tables from endfield_research_kit exports, no binary
  assets. Private domain hosting as fallback.

### Known limitations

- GameData domain not wired (v0.2).
- Story / lore domain not wired (v0.5).
- `startupSync.ts` is a no-op placeholder.
- No Docker image yet.
- Not yet published to npm.
- Git repository not yet initialized.
