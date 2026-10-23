// WORK CAROUSELS: THE GROUPING RULES (2026-10-23, Josh: "carousels inside a
// project, made with Carousel and drag works in",
// documentation/20261023-work-carousels-design.md, "Data model").
//
// A carousel is stored as nothing but an optional `carouselId` on each work
// record. Works of one project that share an id AND sit next to each other in
// the profile's gallery order form one carousel; their order is the slide
// order. The carousel's own settings (S/M/L size, the text blocks after it)
// live on its FIRST slide, the lead.
//
// PURE, like projects.ts: no firebase import. The page, the editor and the
// build all ask this module, so every grouping rule is written here once.
//
//  - groupCarousels: the page prints a run of two or more as a carousel and a
//    run of one as a plain work (minRun 2); the editor shows any run, even of
//    one, as a tray (minRun 1). Callers pass ONE project's works.
//  - carouselSettings: readers take each setting from the first slide that
//    carries it, so a reordered carousel whose lead fields are not saved yet
//    still reads right.
//  - normaliseLeads: moves a run's settings onto its first slide and strips
//    them from the others, so the stored shape matches what readers assume.

/** The fields a carousel keeps on its lead (first) slide. */
export const CAROUSEL_LEAD_FIELDS = ["size", "textAfter", "textAfterDe"] as const;

export interface CarouselFields {
  carouselId?: string;
  size?: string;
  textAfter?: string;
  textAfterDe?: string;
}

export type WorkUnit<W> = { kind: "work"; work: W } | { kind: "carousel"; carouselId: string; works: W[] };

/**
 * Splits one project's works into page units. A run of consecutive works with
 * the same carouselId becomes a carousel when it has at least `minRun` works;
 * a shorter run, and every work without an id, is a plain work. Two runs with
 * the same id that are not adjacent stay two separate runs.
 */
export function groupCarousels<W extends { carouselId?: string }>(works: readonly W[], minRun: 1 | 2): WorkUnit<W>[] {
  const units: WorkUnit<W>[] = [];
  let i = 0;
  while (i < works.length) {
    const id = works[i].carouselId;
    let end = i + 1;
    if (id) while (end < works.length && works[end].carouselId === id) end++;
    const run = works.slice(i, end);
    if (id && run.length >= minRun) units.push({ kind: "carousel", carouselId: id, works: run });
    else for (const work of run) units.push({ kind: "work", work });
    i = end;
  }
  return units;
}

/** The carousel's settings: each field comes from the first slide carrying it. Absent = not set. */
export function carouselSettings<W extends CarouselFields>(
  slides: readonly W[],
): Pick<CarouselFields, "size" | "textAfter" | "textAfterDe"> {
  const settings: Pick<CarouselFields, "size" | "textAfter" | "textAfterDe"> = {};
  for (const field of CAROUSEL_LEAD_FIELDS) {
    for (const slide of slides) {
      if (slide[field]) {
        settings[field] = slide[field];
        break;
      }
    }
  }
  return settings;
}

/**
 * Over the whole gallery array: for every run of consecutive works sharing a
 * carouselId (a run of one included), puts the run's settings on its first
 * slide and deletes the keys from the rest. Works without an id are untouched.
 * Returns a new array and never mutates; unchanged works keep their identity.
 */
export function normaliseLeads<W extends CarouselFields>(items: readonly W[]): W[] {
  const out = items.slice();
  let i = 0;
  while (i < items.length) {
    const id = items[i].carouselId;
    let end = i + 1;
    if (id) while (end < items.length && items[end].carouselId === id) end++;
    if (id) {
      const settings = carouselSettings(items.slice(i, end));
      for (let k = i; k < end; k++) {
        const next: W = { ...items[k] };
        for (const field of CAROUSEL_LEAD_FIELDS) {
          const value = k === i ? settings[field] : undefined;
          if (value !== undefined) next[field] = value;
          else delete next[field];
        }
        if (CAROUSEL_LEAD_FIELDS.some((f) => next[f] !== items[k][f])) out[k] = next;
      }
    }
    i = end;
  }
  return out;
}
