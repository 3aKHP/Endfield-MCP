/**
 * Worldview full-text search.
 *
 * Unlike the story domain (which ships a pre-built `search.json` of 9271
 * scenes), the worldview corpus is small (~414 PRTS items) and its body
 * text requires the TextTable bridge to resolve. So instead of a shipped
 * index, we build the search corpus **eagerly at first query**: for each
 * PRTS item, concatenate its resolved title + body into one searchable
 * string. At ~414 items this is well under 100ms and avoids a mirror-side
 * build step (one less thing to keep in sync).
 *
 * Search is regex (case-insensitive), matching the story domain's contract.
 * Invalid patterns degrade to literal substring matching, same as story.
 *
 * Depends on `./worldviewCore.js` for the item catalog and content resolution.
 */

import { allItems, resolveContent } from "./worldviewCore.js";
import { resolveText } from "./texts.js";
import type { PrtsItem } from "./worldviewTypes.js";

// ---------------------------------------------------------------------------
// Search corpus (private to this module)
// ---------------------------------------------------------------------------

/** One searchable document: item id + concatenated title/body text. */
interface SearchDoc {
  itemId: string;
  type: string;
  text: string;
}

let _corpus: SearchDoc[] | null = null;

/** Reset the search corpus. Called by the barrel orchestrator on sync. */
export function clearWorldviewSearchCache(): void {
  _corpus = null;
}

function corpus(): SearchDoc[] {
  if (_corpus !== null) return _corpus;
  const docs: SearchDoc[] = [];
  for (const [id, item] of allItems()) {
    const title = resolveText(item.name, undefined, id);
    const body = resolveContent(item.contentId);
    // Skip items with neither title nor body — they'd only produce empty
    // matches and clutter results. (Some multimedia items have titles but
    // no transcript; those stay searchable by title.)
    const text = `${title}\n${body}`.trim();
    if (text.length > 0) {
      docs.push({ itemId: id, type: item.type, text });
    }
  }
  _corpus = docs;
  return _corpus;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A search hit: the matching item id, its type, and a context snippet. */
export interface WorldviewSearchHit {
  itemId: string;
  /** Content kind: document / record / multi_media / text. */
  type: string;
  /** Resolved title of the matched item. */
  title: string;
  /** Snippet around the first match. */
  snippet: string;
}

/**
 * Full-text search across all PRTS documents.
 *
 * Searches each item's resolved title + body. Returns hits with a snippet
 * around the first match, capped at `maxResults`.
 */
export function searchWorldview(
  pattern: string,
  maxResults = 30,
): WorldviewSearchHit[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(literal, "i");
  }

  const out: WorldviewSearchHit[] = [];
  for (const doc of corpus()) {
    if (re.test(doc.text)) {
      const item = allItems().get(doc.itemId) as PrtsItem | undefined;
      const title = item
        ? resolveText(item.name, undefined, doc.itemId)
        : doc.itemId;
      // Extract a snippet around the first match.
      const matchIdx = doc.text.search(re);
      const start = Math.max(0, matchIdx - 30);
      const end = Math.min(doc.text.length, matchIdx + 80);
      const snippet = (start > 0 ? "..." : "") +
        doc.text.slice(start, end).replace(/\s+/g, " ").trim() +
        (end < doc.text.length ? "..." : "");
      out.push({ itemId: doc.itemId, type: doc.type, title, snippet });
      if (out.length >= maxResults) break;
    }
  }
  return out;
}
