// THE IMAGES VIEW'S SORT (2026-10-15, Josh: "sort by: date, member, project,
// field/tags. if we sort by member we should have the name of the member and a
// horizontal line separating the different images from member to member ...
// the field/tags should be randomly ordered").
//
// Pure. communityDirectoryController reads each wall tile's data attributes
// into a SortableWork, asks this for sections, and writes the sections back
// as header rows plus tiles. Nothing here touches the DOM, so the grouping is
// unit-tested (tests/unit/communitySort.test.mjs) and the controller's share
// is only the reading and the writing.
//
// WHAT THE SECTIONS MEAN:
//  - date: one unlabelled run, newest first. A sort, not a grouping — there is
//    no line to draw between two dates.
//  - member: one section per member, A→Z by display name. The header links to
//    the member's page (href rides on the member).
//  - project: one section per project, A→Z by title; the works that belong to
//    no project close the list under `noProject`.
//  - field: one section per tag, in the order `random` deals them — Josh's
//    ask, and the same reason the wall itself is shuffled: no tag is first by
//    birthright. The untagged close the list under `noField`. A work is in
//    EVERY section of a tag it carries (2026-10-15, Josh: "show the image in
//    every tag group it belongs to") — the one sort where a tile appears more
//    than once; the controller clones the cell for its second and later
//    sections. The same item object is returned in each, so a caller can tell.
//    With the tag FILTER set every survivor carries that tag, so the sections
//    collapse to one named for it (`filtered`) — a wall filtered to "SEM" and
//    also headed "3D" for the tiles that carry both would be a wall of doubles.
//
// Within a section the input order is kept, and the controller passes the
// standing shuffled-in-bands order, so a section still reads best-first.

//  - random: one unlabelled run in a seeded shuffle of the whole wall
//    (2026-10-30, Josh: "add a random sort mode as well"). The unsorted
//    wall is shuffled IN BANDS, best-first (communityDirectoryController's
//    shuffledInBands); this one ignores the ranking altogether.
export const WORK_SORTS = ["date", "random", "member", "project", "field"] as const;
export type WorkSort = (typeof WORK_SORTS)[number];

export function isWorkSort(value: unknown): value is WorkSort {
  return typeof value === "string" && (WORK_SORTS as readonly string[]).includes(value);
}

export interface SortKey {
  /** Identity — a member's slug, a project's id, a tag's lowercase key. */
  key: string;
  /** What the header prints. */
  label: string;
  /** Where the header links, when it does (a member's page). */
  href?: string;
}

export interface SortableWork {
  /** ISO timestamp of when the work was added; absent sorts last. */
  date?: string;
  member: SortKey;
  project?: SortKey;
  /** The work's tags, every one; absent or empty means untagged. */
  fields?: SortKey[];
}

export interface WorkSection<T> {
  key: string;
  label: string;
  href?: string;
  items: T[];
}

export interface SectionOptions {
  /** 0 ≤ random() < 1 — seeded by the controller so Back reproduces the deal. */
  random: () => number;
  /** Header of the works that belong to no project. */
  noProject: string;
  /** Header of the works that carry no tag. */
  noField: string;
  /** The active tag filter, when there is one. */
  filtered?: SortKey;
}

const byLabel = (a: WorkSection<unknown>, b: WorkSection<unknown>) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

/** Group `items` by `pick`, keeping first-seen order within and between
 *  groups. `null` from `pick` collects into the `rest` section, returned
 *  separately so each sort can decide where it goes (always last, so far). */
function group<T>(
  items: T[],
  pick: (item: T) => SortKey | null | undefined,
  rest: string
): { sections: WorkSection<T>[]; rest: WorkSection<T> } {
  const sections = new Map<string, WorkSection<T>>();
  const restSection: WorkSection<T> = { key: "", label: rest, items: [] };
  for (const item of items) {
    const k = pick(item);
    if (!k) {
      restSection.items.push(item);
      continue;
    }
    let section = sections.get(k.key);
    if (!section) {
      section = { key: k.key, label: k.label, items: [] };
      if (k.href) section.href = k.href;
      sections.set(k.key, section);
    }
    section.items.push(item);
  }
  return { sections: [...sections.values()], rest: restSection };
}

/** Fisher–Yates over a copy, driven by the caller's random source. */
function shuffled<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sectionWorks<T extends SortableWork>(
  items: T[],
  sort: WorkSort,
  opts: SectionOptions
): WorkSection<T>[] {
  if (items.length === 0) return [];

  if (sort === "date") {
    // Stable: ties and the undated keep the standing order. ISO strings
    // compare as dates; an absent one sorts last.
    const sorted = [...items].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    });
    return [{ key: "", label: "", items: sorted }];
  }

  if (sort === "random") {
    return [{ key: "", label: "", items: shuffled(items, opts.random) }];
  }

  if (sort === "member") {
    const { sections, rest } = group(items, (w) => w.member, "");
    const out = sections.sort(byLabel);
    // Every work has a member; `rest` is empty by construction. Kept honest
    // rather than assumed: a tile with no member data would otherwise vanish.
    if (rest.items.length) out.push(rest);
    return out;
  }

  if (sort === "project") {
    const { sections, rest } = group(items, (w) => w.project, opts.noProject);
    const out = sections.sort(byLabel);
    if (rest.items.length) out.push(rest);
    return out;
  }

  // field
  if (opts.filtered) {
    return [{ key: opts.filtered.key, label: opts.filtered.label, items: [...items] }];
  }
  // Not `group`: a work goes into EVERY tag's section it carries, so the
  // walk is items × fields, first-seen order within and between sections.
  const byKey = new Map<string, WorkSection<T>>();
  const rest: WorkSection<T> = { key: "", label: opts.noField, items: [] };
  for (const item of items) {
    const fields = item.fields ?? [];
    if (fields.length === 0) {
      rest.items.push(item);
      continue;
    }
    const seen = new Set<string>();
    for (const f of fields) {
      // The same tag twice on one work (casing, say) is one membership.
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      let section = byKey.get(f.key);
      if (!section) {
        section = { key: f.key, label: f.label, items: [] };
        byKey.set(f.key, section);
      }
      section.items.push(item);
    }
  }
  const out = shuffled([...byKey.values()], opts.random);
  if (rest.items.length) out.push(rest);
  return out;
}
