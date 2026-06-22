/**
 * Character profile (archives) and voice-line reader.
 *
 * This is the **fan-creation core** of the character domain — archives
 * give the background-story text a writer needs, voice lines give the
 * speech patterns. The numeric fields (profession, rarity, weaponType)
 * live in characters.ts:getCharacterInfo for the gameplay-curious.
 *
 * Both profileRecord and profileVoice live inside CharacterTable.json
 * (unlike PRTS-MCP where they're in separate handbook/charword tables),
 * so this module reuses characters.ts's table loader and resolver.
 *
 * ## Text cleaning
 *
 * Endfield's profile text contains rich-text tags like `<@profile.key>`
 * (key markers) and `</>` (close markers). These are display hints, not
 * content — we strip them so the LLM gets clean prose. Voice lines are
 * typically plain text without tags.
 */

import { resolveCharacterEntry } from "./characters.js";
import { resolveText, type LanguageCode, type LocalizedText } from "./texts.js";

// ---------------------------------------------------------------------------
// Types (mirror the CharacterTable sub-objects we read)
// ---------------------------------------------------------------------------

interface RecordField {
  id: string;
  text: string;
}

interface ProfileRecord {
  charId?: string;
  id?: string;
  recordID?: string;
  recordIndex?: number;
  recordTitle: RecordField;
  recordDesc: RecordField;
  unlockType?: number;
  unlockValue?: number;
}

interface ProfileVoice {
  charId?: string;
  id?: string;
  voId?: string;
  voiceIndex?: number;
  voiceTitle: RecordField;
  voiceDesc: RecordField;
  unlockType?: number;
  unlockValue?: number;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ArchiveSection {
  recordId: string;
  title: string;
  text: string;
}

export interface VoiceLine {
  index: number;
  title: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------

/**
 * Strip Endfield rich-text markup from profile/voice text.
 *
 * Two opening-tag families exist in the data (both closed by `</>`):
 *   <@profile.key>...</>   — key/highlight span (98+ distinct tags)
 *   <#ba.consume>...</>    — status/effect span (98 distinct tags, 870+ values)
 *
 * Both are display hints, not content. We strip them so the LLM gets
 * clean prose. The close tag `</>` is shared across both families.
 */
function cleanProfileText(text: string): string {
  // Drop opening tags: <@...> and <#...> (the two Endfield tag families).
  let out = text.replace(/<[#@][a-zA-Z0-9_.]+>/g, "");
  // Drop close tags </>
  out = out.replace(/<\/>/g, "");
  return out.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a character's archive sections (background story text).
 *
 * Returns 3 sections per character (basic profile / personnel summary /
 * archive material), each with a title and full prose body. Text is
 * cleaned of rich-text tags and localized to the requested language.
 *
 * Returns null if the character is not found or has no archive data.
 */
export function getCharacterArchives(
  idOrName: string,
  lang: LanguageCode = "CN",
): ArchiveSection[] | null {
  const resolved = resolveCharacterEntry(idOrName, lang);
  if (resolved === null) return null;

  const records = (resolved.entry as { profileRecord?: ProfileRecord[] })
    .profileRecord;
  if (!records || records.length === 0) return null;

  return records.map((r) => ({
    recordId: r.recordID ?? "",
    title: resolveText(r.recordTitle as LocalizedText, lang, r.recordID ?? ""),
    text: cleanProfileText(
      resolveText(r.recordDesc as LocalizedText, lang, ""),
    ),
  }));
}

/**
 * Get a character's voice lines (speech text with trigger conditions).
 *
 * Returns ~55 lines per character, each with an index, a trigger title
 * (e.g. "行动准备1", "编入队伍1"), and the spoken text. Localized to
 * the requested language.
 *
 * Returns null if the character is not found or has no voice data.
 */
export function getCharacterVoices(
  idOrName: string,
  lang: LanguageCode = "CN",
): VoiceLine[] | null {
  const resolved = resolveCharacterEntry(idOrName, lang);
  if (resolved === null) return null;

  const voices = (resolved.entry as { profileVoice?: ProfileVoice[] })
    .profileVoice;
  if (!voices || voices.length === 0) return null;

  return voices.map((v) => ({
    index: v.voiceIndex ?? 0,
    title: resolveText(v.voiceTitle as LocalizedText, lang, v.voId ?? ""),
    text: cleanProfileText(
      resolveText(v.voiceDesc as LocalizedText, lang, ""),
    ),
  }));
}
