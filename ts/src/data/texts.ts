/**
 * Localization (i18n) resolution layer.
 *
 * Endfield separates values from strings: most tables store `{id, text}`
 * objects where `text` is empty and `id` is an int64 hash. The actual
 * string lives in `I18nTextTable_<LANG>.json` under that hash, and looks
 * like `{"key": "-7078064683023630592", "value": "管理员"}`.
 *
 * This module owns that lookup. It lazily loads one or more language
 * tables (default CN), builds an in-memory `Map<string, string>` index,
 * and exposes `resolveText()` for readers to call without knowing which
 * language is active.
 *
 * ## Key format
 *
 * I18n keys are stored as strings in the upstream JSON even though they
 * look like int64 numbers. JS `number` can't represent int64 exactly
 * (Number.MAX_SAFE_INTEGER is 2^53-1), so we keep them as strings
 * end-to-end. The `{id, text}` objects in game tables also store `id`
 * as a number, so callers convert via `String(loc.id)` before resolving.
 */

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./datasets.js";
import type { JsonStore } from "./stores.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The `{id, text}` shape embedded in nearly every Endfield table.
 *
 * `id` is a string, not a number: Endfield's localization ids are int64
 * hashes that exceed JS Number.MAX_SAFE_INTEGER, so tables must be parsed
 * with `JsonStore.readJsonInt64Safe()` (which wraps large integer literals
 * in quotes). `text` is conventionally empty upstream; the real string is
 * keyed by `id` in the i18n table.
 */
export interface LocalizedText {
  id: string;
  text: string;
}

/** Supported language codes (CN, EN, JP, TC, KR). */
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Store binding
// ---------------------------------------------------------------------------

let _store: JsonStore | null = null;
let _defaultLang: LanguageCode = DEFAULT_LANGUAGE as LanguageCode;

/** Per-language index: hash string → localized string. */
const _indices = new Map<LanguageCode, Map<string, string>>();

export function bindTextStore(store: JsonStore): void {
  _store = store;
  clearTextCaches();
}

/**
 * Set the default language used when `resolveText()` is called without an
 * explicit language. Must be one of SUPPORTED_LANGUAGES.
 */
export function setDefaultLanguage(lang: string): void {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    throw new Error(
      `Unsupported language: ${lang}. Supported: ${SUPPORTED_LANGUAGES.join(", ")}`,
    );
  }
  _defaultLang = lang as LanguageCode;
}

export function getDefaultLanguage(): LanguageCode {
  return _defaultLang;
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/** Drop all loaded language indices. Called by startupSync after refresh. */
export function clearTextCaches(): void {
  _indices.clear();
}

function store(): JsonStore {
  if (_store === null) {
    throw new Error(
      "Text resolver used before bindTextStore() — call it once at startup.",
    );
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Index loading
// ---------------------------------------------------------------------------

/**
 * Load (and cache) one language's i18n index.
 *
 * The i18n file is a flat object: `{ "-7078064683023630592": "管理员", ... }`.
 * Keys are int64 hash values stored as strings (because JS number can't
 * represent int64 exactly — see notes on CharacterTable id handling).
 * Values are the localized strings.
 *
 * We build an in-memory `Map<string, string>` eagerly on first access.
 * With ~50k entries per language this takes a few hundred ms — acceptable
 * because it happens once per language per process lifetime.
 */
export function loadLanguageIndex(lang: LanguageCode): Map<string, string> {
  const cached = _indices.get(lang);
  if (cached !== undefined) return cached;

  // Mirror layout shortens I18nTextTable_CN.json → i18n/CN.json.
  // readJsonInt64Safe is defense-in-depth: the current mirror ships i18n
  // keys as JSON strings, but if upstream ever ships them as bare numeric
  // literals (as it does for {id,text} ids in other tables), plain
  // readJson would truncate the keys and silently break every lookup.
  const path = `i18n/${lang}.json`;
  const raw = store().readJsonInt64Safe<Record<string, string>>(path);
  const index = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      index.set(k, v);
    }
  }
  _indices.set(lang, index);
  return index;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `{id, text}` object to an actual string.
 *
 * Behaviour:
 *   - If `text` is non-empty, return it directly (some tables pre-fill it).
 *   - Otherwise look up `String(id)` in the requested (or default) language.
 *   - On miss, return the fallback string (default: the id itself, so the
 *     caller can see something went wrong without a crash).
 *
 * Callers pass an explicit `lang` only when they need a non-default
 * language (e.g. a future "get this in English" tool option). The vast
 * majority of reads use the process default.
 */
export function resolveText(
  loc: LocalizedText | undefined | null,
  lang?: LanguageCode,
  fallback?: string,
): string {
  if (loc === undefined || loc === null) {
    return fallback ?? "";
  }
  if (loc.text && loc.text.length > 0) {
    return loc.text;
  }
  const effectiveLang = lang ?? _defaultLang;
  try {
    const index = loadLanguageIndex(effectiveLang);
    const hit = index.get(String(loc.id));
    if (hit !== undefined) return hit;
  } catch {
    // Index load failed (missing file, corrupt JSON) — fall through.
  }
  return fallback ?? String(loc.id);
}

/**
 * Resolve in a specific language, returning null on miss (vs resolveText
 * which returns a fallback). Used when callers want to distinguish
 * "found" from "not found" without ambiguity.
 */
export function tryResolveText(
  loc: LocalizedText | undefined | null,
  lang: LanguageCode,
): string | null {
  if (loc === undefined || loc === null) return null;
  if (loc.text && loc.text.length > 0) return loc.text;
  try {
    const index = loadLanguageIndex(lang);
    return index.get(String(loc.id)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Convenience: resolve the same localization across all supported
 * languages. Returns `{CN: "...", EN: "...", ...}` with null for misses.
 * Useful for tools that want to show multilingual names at once.
 */
export function resolveTextAllLanguages(
  loc: LocalizedText | undefined | null,
): Record<LanguageCode, string | null> {
  const out = {} as Record<LanguageCode, string | null>;
  for (const lang of SUPPORTED_LANGUAGES) {
    out[lang] = tryResolveText(loc, lang);
  }
  return out;
}
