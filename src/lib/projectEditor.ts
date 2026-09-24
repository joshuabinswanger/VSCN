// THE GALLERY EDITOR'S PROJECT DECISIONS (2026-09-23, the editor half of
// documentation/20260923-projects-design.md).
//
// /profile needs a session, so nothing here can be walked in a browser
// without one. Every decision the editor makes about projects — where a menu
// move lands, what a drag's DOM order means for the gallery array, where an
// upload into a project is inserted, which stored projects a Save deletes —
// is therefore a pure function over EditorBlock[] or the gallery array, and
// ProfileForm.astro is left holding only the DOM glue. Unit-tested in
// tests/unit/projectEditor.test.mjs.
//
// The shape everything works on is editorBlocks()' list: loose image rows and
// project blocks in gallery order, then the projects no image names yet. The
// operations here edit THAT list; applyBlocks() turns it back into the gallery
// array, which is the only thing stored.
import type { Lang } from "../i18n/utils";
import {
  type AffiliationRecord,
  type EditorBlock,
  type ProfileProject,
  type ProjectFields,
  emptyProjectIds,
  projectTitle,
  resolveMemberCredits,
  toProfileProject,
} from "./projects.ts";

/**
 * One affiliation row as the editor holds it. The stored shape is a union
 * that decides by the presence of `memberUid`; the editor needs the MODE the
 * member chose too, so a Member row whose type-ahead has not matched yet is
 * still a Member row on re-render — and is nothing to save (see
 * affiliationRecords), rather than a name entry by accident.
 */
export interface EditorAffiliation {
  mode: "name" | "member";
  name: string;
  url?: string;
  memberUid?: string;
}

export interface EditorProject {
  projectId: string;
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
  affiliations: EditorAffiliation[];
}

type ProjectBlock = Extract<EditorBlock, { kind: "project" }>;

const anchored = (b: EditorBlock) => b.kind === "image" || b.indices.length > 0;

function locate(blocks: readonly EditorBlock[], index: number): { at: number; position: number } | null {
  for (let at = 0; at < blocks.length; at++) {
    const b = blocks[at];
    if (b.kind === "image") {
      if (b.index === index) return { at, position: -1 };
    } else {
      const position = b.indices.indexOf(index);
      if (position !== -1) return { at, position };
    }
  }
  return null;
}

function withoutIndex(blocks: readonly EditorBlock[], index: number): EditorBlock[] {
  return blocks.flatMap((b): EditorBlock[] => {
    if (b.kind === "image") return b.index === index ? [] : [b];
    return b.indices.includes(index) ? [{ ...b, indices: b.indices.filter((i) => i !== index) }] : [b];
  });
}

/**
 * The gallery array a block list stands for: an image block's item loses its
 * projectId, a project block's items take the block's. The inverse of
 * editorBlocks(), and the one read-back after a drag — the DOM order is the
 * truth for that moment, and this is how it becomes state.
 */
export function applyBlocks<T extends { projectId?: string }>(gallery: readonly T[], blocks: readonly EditorBlock[]): T[] {
  const out: T[] = [];
  for (const b of blocks) {
    if (b.kind === "image") {
      const loose = { ...gallery[b.index] };
      delete loose.projectId;
      out.push(loose);
    } else {
      for (const i of b.indices) out.push({ ...gallery[i], projectId: b.projectId });
    }
  }
  return out;
}

/**
 * Swaps a block with its neighbour. Null when that would change nothing the
 * member can see: an empty project block has no image to anchor it and sits
 * at the end however the list is stored, so an anchored block cannot step
 * "below" one, nor an empty one climb above an anchored one. Two empty blocks
 * may trade places — that order is the `projects` order, kept locally.
 */
function moveBlock(blocks: readonly EditorBlock[], at: number, delta: -1 | 1): EditorBlock[] | null {
  const to = at + delta;
  if (to < 0 || to >= blocks.length) return null;
  if (anchored(blocks[at]) !== anchored(blocks[to])) return null;
  const out = blocks.slice();
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

/**
 * Move up / Move down for an image row, within its container: a loose row
 * steps past the neighbouring outer block (which may be a whole project), a
 * row inside a project swaps with its sibling and never leaves the block.
 */
export function moveImage(blocks: readonly EditorBlock[], index: number, delta: -1 | 1): EditorBlock[] | null {
  const where = locate(blocks, index);
  if (!where) return null;
  if (where.position === -1) return moveBlock(blocks, where.at, delta);
  const block = blocks[where.at] as ProjectBlock;
  const to = where.position + delta;
  if (to < 0 || to >= block.indices.length) return null;
  const indices = block.indices.slice();
  [indices[where.position], indices[to]] = [indices[to], indices[where.position]];
  return blocks.map((b, i) => (i === where.at ? { ...block, indices } : b));
}

/** Move up / Move down for a project header: the whole block past its neighbour. */
export function moveProject(blocks: readonly EditorBlock[], projectId: string, delta: -1 | 1): EditorBlock[] | null {
  const at = blocks.findIndex((b) => b.kind === "project" && b.projectId === projectId);
  return at === -1 ? null : moveBlock(blocks, at, delta);
}

/** "Move to project →": the image leaves wherever it was and joins the end of that block. */
export function moveToProject(blocks: readonly EditorBlock[], index: number, projectId: string): EditorBlock[] {
  const target = blocks.find((b): b is ProjectBlock => b.kind === "project" && b.projectId === projectId);
  if (!target || target.indices.includes(index)) return blocks.slice();
  return withoutIndex(blocks, index).map((b) =>
    b.kind === "project" && b.projectId === projectId ? { ...b, indices: [...b.indices, index] } : b,
  );
}

/** "Remove from project": the image becomes a loose row directly below its block. */
export function removeFromProject(blocks: readonly EditorBlock[], index: number): EditorBlock[] {
  const where = locate(blocks, index);
  if (!where || where.position === -1) return blocks.slice();
  const out = withoutIndex(blocks, index);
  out.splice(where.at + 1, 0, { kind: "image", index });
  return out;
}

/** "Delete project": its images stay, ungrouped, exactly where the block stood. */
export function dissolveProject(blocks: readonly EditorBlock[], projectId: string): EditorBlock[] {
  return blocks.flatMap((b) =>
    b.kind === "project" && b.projectId === projectId
      ? b.indices.map((index): EditorBlock => ({ kind: "image", index }))
      : [b],
  );
}

/**
 * Where a finished upload lands: directly after the last image of the project
 * it was dropped into, so it appears inside the block it was added to; at the
 * end otherwise, as uploads always did. A project's first image goes to the
 * end too — the empty block waits there, and that is where it fills.
 */
export function insertUploaded<T extends { projectId?: string }>(
  gallery: readonly T[],
  item: T,
  projects?: readonly { projectId: string }[],
): T[] {
  // The block it was dropped into may be gone by the time the bytes land —
  // deleted through the menu, or by a Save's delete step. The item then
  // arrives loose; keeping the id would write a dangling projectId onto the
  // record at every later Save (review, fix round 1).
  if (item.projectId && projects && !projects.some((p) => p.projectId === item.projectId)) {
    const loose = { ...item };
    delete loose.projectId;
    item = loose;
  }
  const out = gallery.slice();
  const last = item.projectId ? gallery.map((g) => g.projectId).lastIndexOf(item.projectId) : -1;
  out.splice(last === -1 ? out.length : last + 1, 0, item);
  return out;
}

/**
 * The ids a partly refused saveProjects() DID write. allSettled means A can
 * be created while B is refused; if only the failure were remembered, the
 * next Save would treat A as new again — setDoc with a fresh createdAt on
 * an existing document, which the rules pin — and A would be refused on
 * every Save until reload (review, fix round 1).
 */
export function writtenProjectIds(
  used: readonly { projectId: string }[],
  failures: readonly { projectId: string }[],
): string[] {
  const failed = new Set(failures.map((f) => f.projectId));
  return used.map((p) => p.projectId).filter((id) => !failed.has(id));
}

/**
 * Which member a credit row names. While the text is still the name the
 * credit was stored or matched with, the existing member is KEPT — a
 * member who has since hidden their profile is not in the options any more,
 * and a namesake would otherwise take over the credit on a mere focus
 * (review, fix round 1). New text resolves afresh against the options, to
 * the first member wearing exactly that name, or to nobody.
 */
export function memberUidFor(
  typed: string,
  options: readonly { uid: string; name: string }[] | null,
  current: { name: string; memberUid?: string },
): string | undefined {
  const text = typed.trim();
  if (current.memberUid && text === current.name.trim()) return current.memberUid;
  return options?.find((m) => m.name === text)?.uid;
}

/**
 * The `projects` order after a drag: the blocks' DOM order first, anything not
 * on screen after, in its old order. Only the empty blocks' relative order
 * shows — a used project sits where its first image sits — but a dragged
 * empty block should at least keep its place among the other empty ones.
 */
export function orderProjects<P extends { projectId: string }>(projects: readonly P[], idsInOrder: readonly string[]): P[] {
  const rank = new Map(idsInOrder.map((id, i) => [id, i]));
  return projects
    .map((p, i) => ({ p, key: rank.get(p.projectId) ?? idsInOrder.length + i }))
    .sort((a, b) => a.key - b.key)
    .map(({ p }) => p);
}

/**
 * What the block header and the Save error call a project: its title for the
 * lang (both ways, like the page), else "Project n" — counting only the
 * untitled ones, so the numbers do not jump when a titled project sits between.
 */
export function projectLabel(
  projects: readonly { projectId: string; title?: string; titleDe?: string }[],
  projectId: string,
  lang: Lang,
  untitled: string,
): string {
  const p = projects.find((x) => x.projectId === projectId);
  const title = p && projectTitle(p, lang)?.trim();
  if (title) return title;
  const untitledIds = projects.filter((x) => !projectTitle(x, lang)?.trim()).map((x) => x.projectId);
  const n = untitledIds.indexOf(projectId);
  return untitled.replace("{n}", n === -1 ? "?" : String(n + 1));
}

export function editorAffiliations(records: readonly AffiliationRecord[] | undefined): EditorAffiliation[] {
  return (records ?? []).map((a) =>
    "memberUid" in a
      ? { mode: "member", name: a.name, memberUid: a.memberUid }
      : { mode: "name", name: a.name, ...(a.url ? { url: a.url } : {}) },
  );
}

/**
 * Rows → the stored shapes. A Member row that never matched a member has
 * nobody to credit and is dropped, not demoted to a name; a blank name is
 * nothing either way (projectFields() would drop it too — this keeps the
 * preview and Save agreeing before that).
 */
export function affiliationRecords(rows: readonly EditorAffiliation[]): AffiliationRecord[] {
  const out: AffiliationRecord[] = [];
  for (const a of rows) {
    const name = a.name.trim();
    if (!name) continue;
    if (a.mode === "member") {
      if (a.memberUid) out.push({ memberUid: a.memberUid, name });
      continue;
    }
    const url = a.url?.trim();
    out.push(url ? { name, url } : { name });
  }
  return out;
}

/** The editor's project as saveProjects() and toProfileProject() take it. */
export function toProjectRecord(p: EditorProject): ProjectFields & { projectId: string } {
  const { affiliations, ...fields } = p;
  const records = affiliationRecords(affiliations);
  return { ...fields, ...(records.length ? { affiliations: records } : {}) };
}

/**
 * The preview's projects: the ones an image names (the build skips an empty
 * project, so the preview must too), as ProfileProjects with their credits
 * resolved to the slugs the editor knows — a credit with no slug renders as
 * plain text, as on the page.
 */
export function previewProjects(
  uid: string,
  projects: readonly EditorProject[],
  gallery: readonly { projectId?: string }[],
  slugByUid: ReadonlyMap<string, string>,
): ProfileProject[] {
  const used = new Set(gallery.map((g) => g.projectId));
  return projects
    .filter((p) => used.has(p.projectId))
    .map((p) => resolveMemberCredits(toProfileProject({ ownerUid: uid, ...toProjectRecord(p) }), slugByUid));
}

/**
 * What Save deletes, last: stored projects no image names any more — the ones
 * dragged empty and the ones removed through the menu, which are already gone
 * from `projects` and so only `deletedIds` remembers them.
 */
export function emptiedStoredIds(
  gallery: readonly { projectId?: string }[],
  projects: readonly { projectId: string }[],
  storedIds: ReadonlySet<string>,
  deletedIds: ReadonlySet<string>,
): string[] {
  return [...new Set([...emptyProjectIds(gallery, projects), ...deletedIds])].filter((id) => storedIds.has(id));
}

/**
 * The delete step's list. The candidates are emptiedStoredIds() taken when
 * Save STARTS — the gallery Save read, not whatever the member dragged
 * during its awaits (final review, 2026-09-24). A candidate an image names
 * again by the time the delete runs is kept: the member refilled it, and
 * deleting it would leave that image naming nothing.
 */
export function projectsToDelete(candidates: readonly string[], galleryNow: readonly { projectId?: string }[]): string[] {
  const named = new Set(galleryNow.map((g) => g.projectId).filter(Boolean));
  return candidates.filter((id) => !named.has(id));
}

/**
 * The loaded gallery with every projectId that names no stored project
 * removed. Such an item already shows loose (editorBlocks ignores an unknown
 * project), but kept the id — and saveGalleryRecords() writes the item's
 * projectId, so the dangling id went back onto the record at every Save
 * (final review, 2026-09-24). Stripped, the next Save deletes it instead.
 */
export function withoutDanglingProjects<T extends { projectId?: string }>(gallery: readonly T[], storedIds: ReadonlySet<string>): T[] {
  return gallery.map((item) => {
    if (!item.projectId || storedIds.has(item.projectId)) return item;
    const loose = { ...item };
    delete loose.projectId;
    return loose;
  });
}

/** Whether two gallery arrays hold the same ids in the same order. */
export function sameIds(a: readonly { imageId: string }[], b: readonly { imageId: string }[]): boolean {
  return a.length === b.length && a.every((g, i) => g.imageId === b[i].imageId);
}
