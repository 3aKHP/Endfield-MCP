# Changelog

All notable changes to EndField-MCP (TypeScript implementation) are recorded
here. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased] — v0.2.0 GameData domain

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
- **CD pipeline** (`.github/workflows/cd.yml`): tag-triggered, fetches bundled data → npm publish with provenance.
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

## [0.1.0-unreleased] — v0.1.0 skeleton

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
- **Stateless HTTP transport** (no session tracking). EndField-MCP has no
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
