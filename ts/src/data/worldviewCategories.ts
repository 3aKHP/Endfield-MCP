/**
 * Worldview category listing — the browse entry points.
 *
 * Exposes the two top-level trees of the worldview domain:
 *   - PRTS archive categories (collection/document/media/...) and their
 *     first-level groups (the unit a player opens to read documents)
 *   - In-game wiki categories and the groups under each
 *
 * Both trees are eager-loaded and cached in `worldviewCore`; this module
 * just shapes them for tool consumption (resolving display names through
 * i18n). Depends on `./worldviewCore.js` for the catalog loaders and
 * `./texts.js` for name resolution.
 */

import { resolveText } from "./texts.js";
import {
  firstLvGroups,
  prtsCategories,
  wikiCategories,
  wikiGroups,
} from "./worldviewCore.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A PRTS category with its display name resolved, plus its group count. */
export interface LoreCategoryView {
  categoryId: string;
  displayName: string;
  order: number;
  /** Number of first-level groups in this category. */
  groupCount: number;
}

/** A wiki category with its display name resolved, plus its group count. */
export interface WikiCategoryView {
  categoryId: string;
  displayName: string;
  priority: number;
  /** Number of groups under this category. */
  groupCount: number;
}

/** A first-level group with its display name resolved. */
export interface LoreGroupView {
  firstLvId: string;
  categoryId: string;
  displayName: string;
  /** Resolved subtitle, or "" if absent. */
  subtitle: string;
  order: number;
  /** Number of narrative items in this group. */
  itemCount: number;
}

/** A wiki group with its display name resolved. */
export interface WikiGroupView {
  groupId: string;
  categoryId: string;
  displayName: string;
}

/**
 * List the PRTS archive's top-level categories.
 *
 * Each category is annotated with how many first-level groups it contains,
 * so a caller can see the browse depth without a second round-trip.
 */
export function listLoreCategories(): LoreCategoryView[] {
  const groups = firstLvGroups();
  const countByCat = new Map<string, number>();
  for (const g of groups) {
    countByCat.set(g.categoryId, (countByCat.get(g.categoryId) ?? 0) + 1);
  }
  return prtsCategories().map((c) => ({
    categoryId: c.categoryId,
    displayName: resolveText(c.name, undefined, c.categoryId),
    order: c.order,
    groupCount: countByCat.get(c.categoryId) ?? 0,
  }));
}

/**
 * List first-level groups within a PRTS category.
 *
 * Returns an empty array if the category id is unknown.
 */
export function listLoreGroups(categoryId: string): LoreGroupView[] {
  const lower = categoryId.toLowerCase();
  return firstLvGroups()
    .filter((g) => g.categoryId.toLowerCase() === lower)
    .map((g) => ({
      firstLvId: g.firstLvId,
      categoryId: g.categoryId,
      displayName: resolveText(g.name, undefined, g.firstLvId),
      subtitle: resolveText(g.subName),
      order: g.order,
      itemCount: g.itemIds.length,
    }));
}

/**
 * List the in-game wiki's top-level categories.
 */
export function listWikiCategories(): WikiCategoryView[] {
  const groups = wikiGroups();
  return wikiCategories().map((c) => ({
    categoryId: c.categoryId,
    displayName: resolveText(c.categoryName, undefined, c.categoryId),
    priority: c.categoryPriority,
    groupCount: groups.get(c.categoryId)?.length ?? 0,
  }));
}

/**
 * List wiki groups within a category.
 *
 * Returns an empty array if the category id is unknown.
 */
export function listWikiGroups(categoryId: string): WikiGroupView[] {
  const lower = categoryId.toLowerCase();
  const list = wikiGroups().get(lower);
  if (!list) {
    // wikiGroups keys are stored verbatim (e.g. "wiki_type_monster"); also
    // try an exact match in case the caller passed the canonical casing.
    const exact = wikiGroups().get(categoryId);
    if (!exact) return [];
    return exact.map((g) => ({
      groupId: g.groupId,
      categoryId,
      displayName: resolveText(g.groupName, undefined, g.groupId),
    }));
  }
  return list.map((g) => ({
    groupId: g.groupId,
    categoryId: lower,
    displayName: resolveText(g.groupName, undefined, g.groupId),
  }));
}
