import { useSyncExternalStore } from 'react';

import type { Recipe } from './types';

/** Labels get the same spelling everywhere: trimmed, lowercase, no commas. */
export function normalizeTag(input: string): string {
  return input.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A recipe's labels after replacing `from` by `to` (null removes them). The new label takes
 * the place of the first old one, and appears only once.
 */
export function replaceTags(tags: string[], from: string[], to: string | null): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const next = from.includes(tag) ? to : tag;
    if (next && !result.includes(next)) result.push(next);
  }
  return result;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Spelled almost the same: "oven schotel"/"ovenschotel", "pasta"/"pastas", "vegatarisch"/"vegetarisch". */
function looksAlike(a: string, b: string): boolean {
  const x = a.replace(/[\s-]/g, '');
  const y = b.replace(/[\s-]/g, '');
  if (x === y) return true;
  if (`${x}s` === y || `${y}s` === x || `${x}en` === y || `${y}en` === x) return true;
  return Math.min(x.length, y.length) >= 5 && editDistance(x, y) <= 1;
}

/** Groups of labels that are probably the same, most used label first. */
export function similarTags(tags: { tag: string; count: number }[]): { tag: string; count: number }[][] {
  const groups: { tag: string; count: number }[][] = [];
  const grouped = new Set<string>();
  // `tags` is sorted by use, so each group starts with its most used label.
  for (const [i, first] of tags.entries()) {
    if (grouped.has(first.tag)) continue;
    const group = [first];
    for (const other of tags.slice(i + 1)) {
      if (!grouped.has(other.tag) && group.some((g) => looksAlike(g.tag, other.tag))) group.push(other);
    }
    if (group.length > 1) {
      group.forEach((g) => grouped.add(g.tag));
      groups.push(group);
    }
  }
  return groups;
}

/** Every label with the number of recipes that have it, most used first. */
export function tagsByUse(recipes: Recipe[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tag of recipes.flatMap((r) => r.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'nl'));
}

// The labels to filter the recipes on. Shared, so the "Alle labels" screen and the
// recipes tab show the same selection.
let selected: string[] = [];
const listeners = new Set<() => void>();

function setSelectedTags(tags: string[]) {
  selected = tags;
  listeners.forEach((l) => l());
}

export function toggleSelectedTag(tag: string) {
  setSelectedTags(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
}

export function clearSelectedTags() {
  setSelectedTags([]);
}

/** Keeps the filter working after labels were merged, renamed or removed. */
export function replaceSelectedTags(from: string[], to: string | null) {
  if (selected.some((t) => from.includes(t))) setSelectedTags(replaceTags(selected, from, to));
}

export function useSelectedTags(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selected,
  );
}
