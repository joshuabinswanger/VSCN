// THE GALLERY EDITOR'S CAROUSEL MOVES (2026-10-23, the editor half of
// documentation/20261023-work-carousels-design.md).
//
// Like projectEditor.ts: every decision is a pure function, and the controller
// holds only DOM glue. Each function takes the GALLERY ARRAY (the one stored
// order) and returns a new array, or null when a move would change nothing.
// An index is always a gallery index. Nothing mutates its input, and clearing
// a field DELETES the key (absent = not set), as applyBlocks() does.
//
// A project's works are the items with its projectId; the editor keeps them
// contiguous, but nothing here breaks if they are not, because every move is
// expressed as positions within the whole array. A "unit" is a run of
// consecutive works of one project sharing a carouselId (a run of one
// included, as the editor draws it), or one plain work.
//
// These functions do NOT normalise lead fields; the controller calls
// normaliseLeads() (carousels.ts) after a move, and handOffLead() BEFORE a
// lead leaves its carousel, so the carousel's text is never lost.
import { carouselSettings, CAROUSEL_LEAD_FIELDS } from "./carousels.ts";

type Item = {
  projectId?: string;
  carouselId?: string;
  size?: string;
  textAfter?: string;
  textAfterDe?: string;
};

/** The unit [start, end) that holds `index`. */
function unitAt(gallery: readonly Item[], index: number): [number, number] {
  const { carouselId, projectId } = gallery[index];
  if (!carouselId) return [index, index + 1];
  const inRun = (k: number) => gallery[k].carouselId === carouselId && gallery[k].projectId === projectId;
  let start = index;
  while (start > 0 && inRun(start - 1)) start--;
  let end = index + 1;
  while (end < gallery.length && inRun(end)) end++;
  return [start, end];
}

/** Swaps the adjacent blocks [a, b) and [b, c). */
function swapBlocks<T>(gallery: readonly T[], a: number, b: number, c: number): T[] {
  return [...gallery.slice(0, a), ...gallery.slice(b, c), ...gallery.slice(a, b), ...gallery.slice(c)];
}

/** Steps the unit [start, end) over its neighbouring unit; null at the project's edge. */
function stepUnit<T extends Item>(gallery: readonly T[], start: number, end: number, delta: -1 | 1): T[] | null {
  const project = gallery[start].projectId;
  if (delta === 1) {
    if (end >= gallery.length || gallery[end].projectId !== project) return null;
    const [, nextEnd] = unitAt(gallery, end);
    return swapBlocks(gallery, start, end, nextEnd);
  }
  if (start === 0 || gallery[start - 1].projectId !== project) return null;
  const [prevStart] = unitAt(gallery, start - 1);
  return swapBlocks(gallery, prevStart, start, end);
}

/**
 * A work outside a carousel steps over the whole neighbouring unit (a carousel
 * moves as one). A slide swaps only with its sibling slide: the tray's arrows.
 * Null at a project's edge or a carousel's edge.
 */
export function moveWork<T extends Item>(gallery: readonly T[], index: number, delta: -1 | 1): T[] | null {
  if (index < 0 || index >= gallery.length) return null;
  if (gallery[index].carouselId) {
    const [start, end] = unitAt(gallery, index);
    const to = index + delta;
    if (to < start || to >= end) return null;
    const out = gallery.slice();
    [out[index], out[to]] = [out[to], out[index]];
    return out;
  }
  return stepUnit(gallery, index, index + 1, delta);
}

/** The carousel as one unit steps over the neighbouring unit; null at its project's edge. */
export function moveCarousel<T extends Item>(gallery: readonly T[], carouselId: string, delta: -1 | 1): T[] | null {
  const at = gallery.findIndex((g) => g.carouselId === carouselId);
  if (at === -1) return null;
  const [start, end] = unitAt(gallery, at);
  return stepUnit(gallery, start, end, delta);
}

/** Gallery indices of a carousel's slides. */
function slideIndices(gallery: readonly Item[], carouselId: string, projectId: string | undefined): number[] {
  const out: number[] = [];
  gallery.forEach((g, k) => {
    if (g.carouselId === carouselId && g.projectId === projectId) out.push(k);
  });
  return out;
}

/** Insertion point at the end of a project: after its last work, else the array's end. */
function endOfProject(gallery: readonly Item[], projectId: string): number {
  for (let k = gallery.length - 1; k >= 0; k--) if (gallery[k].projectId === projectId) return k + 1;
  return gallery.length;
}

/**
 * Gives the work the carousel's id and project and moves it into the run at
 * `position` (default: the end). A carousel with no slides yet: the work keeps
 * its place when it is already in that project, otherwise it goes to the end of
 * that project. Arriving from another carousel it simply leaves that one (the
 * caller hands its lead off first).
 */
export function joinCarousel<T extends Item>(
  gallery: readonly T[],
  index: number,
  target: { carouselId: string; projectId: string },
  position?: number,
): T[] {
  const work: T = { ...gallery[index], carouselId: target.carouselId, projectId: target.projectId };
  const rest = gallery.filter((_, k) => k !== index);
  const slides = slideIndices(rest, target.carouselId, target.projectId);
  let at: number;
  if (slides.length === 0) {
    at = gallery[index].projectId === target.projectId ? index : endOfProject(rest, target.projectId);
  } else {
    const p = Math.max(0, Math.min(position ?? slides.length, slides.length));
    at = p >= slides.length ? slides[slides.length - 1] + 1 : slides[p];
  }
  return [...rest.slice(0, at), work, ...rest.slice(at)];
}

/**
 * Clears the work's carouselId and places it directly after the last remaining
 * slide of its run (it keeps its place when it was the only slide).
 */
export function takeOut<T extends Item>(gallery: readonly T[], index: number): T[] {
  const { carouselId, projectId } = gallery[index];
  if (!carouselId) return gallery.slice();
  const work: T = { ...gallery[index] };
  delete work.carouselId;
  const rest = gallery.filter((_, k) => k !== index);
  const slides = slideIndices(rest, carouselId, projectId);
  const at = slides.length ? slides[slides.length - 1] + 1 : index;
  return [...rest.slice(0, at), work, ...rest.slice(at)];
}

/** Clears the id from every slide, keeping their order. */
export function dissolve<T extends Item>(gallery: readonly T[], carouselId: string): T[] {
  return gallery.map((g) => {
    if (g.carouselId !== carouselId) return g;
    const next: T = { ...g };
    delete next.carouselId;
    return next;
  });
}

/** Sets the target project on every slide and moves the run, together, to the end of that project. */
export function moveCarouselToProject<T extends Item>(gallery: readonly T[], carouselId: string, projectId: string): T[] {
  const slides = gallery.filter((g) => g.carouselId === carouselId).map((g): T => ({ ...g, projectId }));
  const rest = gallery.filter((g) => g.carouselId !== carouselId);
  const at = endOfProject(rest, projectId);
  return [...rest.slice(0, at), ...slides, ...rest.slice(at)];
}

/**
 * When `index` is the first slide of a run with a second slide, copies the
 * carousel's lead fields onto that second slide. `heir` is its gallery index,
 * so the caller can write it to the record at once. Otherwise (not a lead, a
 * run of one, or nothing to hand over) the gallery comes back unchanged with no
 * heir.
 */
export function handOffLead<T extends Item>(gallery: readonly T[], index: number): { gallery: T[]; heir?: number } {
  const unchanged = { gallery: gallery.slice() };
  if (!gallery[index]?.carouselId) return unchanged;
  const [start, end] = unitAt(gallery, index);
  if (index !== start || end - start < 2) return unchanged;
  const settings = carouselSettings(gallery.slice(start, end));
  if (CAROUSEL_LEAD_FIELDS.every((f) => settings[f] === undefined)) return unchanged;
  const out = gallery.slice();
  out[index + 1] = { ...gallery[index + 1], ...settings };
  return { gallery: out, heir: index + 1 };
}

/**
 * The carousel ids of one project in display order, then the editor's local
 * (still empty) carousels of that project. Drives the "Carousel 1", "Carousel 2" labels.
 */
export function projectCarouselIds<T extends Item>(
  gallery: readonly T[],
  projectId: string,
  local: readonly { carouselId: string; projectId: string }[],
): string[] {
  const ids: string[] = [];
  for (const g of gallery) {
    if (g.projectId === projectId && g.carouselId && !ids.includes(g.carouselId)) ids.push(g.carouselId);
  }
  for (const l of local) {
    if (l.projectId === projectId && !ids.includes(l.carouselId)) ids.push(l.carouselId);
  }
  return ids;
}
