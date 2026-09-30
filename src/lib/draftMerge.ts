// The profile editor's tab draft, pure: what counts as unsaved, and how a
// recovered draft is folded back onto whatever the account holds NOW.
//
// Two kinds of state live side by side in the editor, and the draft must tell
// them apart (review, 2026-09-28):
//
//   - COMMITTED THE MOMENT IT HAPPENS: which works the gallery holds and in
//     what order. Uploads, removals, moves, replacements, video links and
//     poster restores all write the ids array through persistGalleryNow()
//     without waiting for Save, because they own bytes in Storage.
//   - COMMITTED AT SAVE: every WORD on a work (saveGalleryRecords writes
//     caption, captionDe, description, descriptionDe, link, siteLink, tags,
//     projectId onto the record) and every project document.
//
// Counting the first kind as "dirty" is how "upload one image, leave" came to
// raise the leave prompt and then offer to restore a draft that held nothing;
// and REPLACING the gallery with a draft's copy is how an image uploaded on
// the next visit vanished from the editor and was dropped by the next Save.
// So the draft holds only words, keyed by record id, and restore MERGES.
import type { GalleryItem } from "./gallery.ts";
import type { EditorProject } from "./projectEditor.ts";
import { contiguousOrder } from "./projects.ts";

/** The fields Save writes onto an image record — the only per-work state that can be unsaved. */
export interface WorkWords {
  caption: string;
  captionDe: string;
  description: string;
  descriptionDe: string;
  link: string;
  siteLink: string;
  tags: string[];
  projectId: string;
}

export interface DraftWork {
  imageId: string;
  words: WorkWords;
}

/** What the draft records about projects: the editor's list plus the two sets Save reads. */
export interface DraftProjects {
  projects: EditorProject[];
  /** Project documents that existed when the draft was written. */
  storedProjectIds: string[];
  /** Stored projects the member deleted in the editor (a Save-time deletion). */
  deletedProjectIds: string[];
}

export function workWords(item: Pick<GalleryItem, "caption" | "captionDe" | "description" | "descriptionDe" | "link" | "siteLink" | "tags" | "projectId">): WorkWords {
  return {
    caption: item.caption ?? "",
    captionDe: item.captionDe ?? "",
    description: item.description ?? "",
    descriptionDe: item.descriptionDe ?? "",
    link: item.link ?? "",
    siteLink: item.siteLink ?? "",
    tags: Array.isArray(item.tags) ? item.tags.slice() : [],
    projectId: item.projectId ?? "",
  };
}

export function sameWords(a: WorkWords, b: WorkWords): boolean {
  return (
    a.caption === b.caption &&
    a.captionDe === b.captionDe &&
    a.description === b.description &&
    a.descriptionDe === b.descriptionDe &&
    a.link === b.link &&
    a.siteLink === b.siteLink &&
    a.projectId === b.projectId &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, i) => tag === b.tags[i])
  );
}

/** At load (and after a Save) every work's words are the record's. */
export function committedFromLoad(gallery: readonly GalleryItem[]): Map<string, WorkWords> {
  return new Map(gallery.map((item) => [item.imageId, workWords(item)]));
}

/**
 * A work that just arrived — an upload's record or a video's — carries its
 * initial words (a video's platform title as caption) on the record already.
 * Its projectId does not: the record is created without one, and the block
 * an upload was dropped into is written onto it at Save like any other word.
 */
export function committedForNew(item: GalleryItem): WorkWords {
  return { ...workWords(item), projectId: "" };
}

/**
 * The works Save would still write, sorted by id so that committed order and
 * membership never register as a change. This is both the dirty signature's
 * gallery half and what the draft stores.
 */
export function uncommittedWorks(gallery: readonly GalleryItem[], committed: ReadonlyMap<string, WorkWords>): DraftWork[] {
  const out: DraftWork[] = [];
  for (const item of gallery) {
    const words = workWords(item);
    const base = committed.get(item.imageId);
    if (base && sameWords(words, base)) continue;
    out.push({ imageId: item.imageId, words });
  }
  return out.sort((a, b) => (a.imageId < b.imageId ? -1 : a.imageId > b.imageId ? 1 : 0));
}

/** Projects by id: a block move reorders `projects` (orderProjects) and stores that order through the gallery ids, so order must not count. */
export function projectSignature(projects: readonly EditorProject[]): EditorProject[] {
  return projects.slice().sort((a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0));
}

function applyWords(item: GalleryItem, words: WorkWords, projectIds: ReadonlySet<string>): GalleryItem {
  const next: GalleryItem = { ...item, caption: words.caption };
  const optional = ["captionDe", "description", "descriptionDe", "link", "siteLink"] as const;
  for (const key of optional) {
    if (words[key]) next[key] = words[key];
    else delete next[key];
  }
  if (words.tags.length) next.tags = words.tags.slice();
  else delete next.tags;
  // The draft's block, if that block still exists; a block deleted since the
  // draft was written cannot be named, so the record's own membership stays.
  if (!words.projectId) delete next.projectId;
  else if (projectIds.has(words.projectId)) next.projectId = words.projectId;
  return next;
}

/**
 * Restore, gallery half: the LIVE membership and order stay (they are
 * committed), the draft's words land on the works present in both, and a
 * draft work that is no longer live is ignored — a recovered draft cannot
 * resurrect removed media. Members of a project are kept adjacent, as load
 * does; the caller stores the order if that moved anything.
 */
export function mergeDraftGallery(live: readonly GalleryItem[], works: readonly DraftWork[], projectIds: ReadonlySet<string>): GalleryItem[] {
  const byId = new Map(works.map((w) => [w.imageId, w.words]));
  const merged = live.map((item) => {
    const words = byId.get(item.imageId);
    return words ? applyWords(item, words, projectIds) : item;
  });
  return contiguousOrder(merged, (g) => g.projectId);
}

/**
 * Restore, projects half. For each project the account holds now: the
 * draft's fields if the draft knew it, else as loaded; if the draft had
 * deleted it, it is deleted again (the caller re-marks it for Save). A draft
 * project the account no longer holds is dropped when it was stored at draft
 * time (deleted since, elsewhere) and kept when it was never stored — a
 * genuinely new, unsaved block.
 */
export function mergeDraftProjects(
  live: readonly EditorProject[],
  draft: DraftProjects,
  storedNow: ReadonlySet<string>,
): { projects: EditorProject[]; deleted: string[] } {
  const draftById = new Map(draft.projects.map((p) => [p.projectId, p]));
  const storedAtDraft = new Set(draft.storedProjectIds);
  const deletedInDraft = new Set(draft.deletedProjectIds);
  const projects: EditorProject[] = [];
  const deleted: string[] = [];
  const seen = new Set<string>();
  for (const project of live) {
    seen.add(project.projectId);
    const fromDraft = draftById.get(project.projectId);
    if (fromDraft) projects.push(cloneProject(fromDraft));
    else if (deletedInDraft.has(project.projectId) && storedNow.has(project.projectId)) deleted.push(project.projectId);
    else projects.push(project);
  }
  for (const project of draft.projects) {
    if (seen.has(project.projectId) || storedAtDraft.has(project.projectId)) continue;
    projects.push(cloneProject(project));
  }
  return { projects, deleted };
}

function cloneProject(p: EditorProject): EditorProject {
  return {
    ...p,
    affiliations: Array.isArray(p.affiliations) ? p.affiliations.map((a) => ({ ...a })) : [],
    ...(Array.isArray(p.tags) && p.tags.length ? { tags: p.tags.slice() } : {}),
  };
}

/**
 * Same-origin links the ClientRouter would soft-navigate, and nothing else —
 * mirrors the router's own click filter (astro/components/ClientRouter.astro)
 * so the leave guard intercepts exactly the clicks the router would have
 * taken. Returns the href to guard, or null to let the click through:
 * modified clicks and non-primary buttons (a new tab leaves this page
 * intact), other targets, downloads, `data-astro-reload`, other origins, and
 * a hash-only move within the same page.
 */
export function guardedLinkHref(
  link: { href: string; target: string; download: boolean; reload: boolean },
  click: { button: number; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean },
  current: string,
): string | null {
  if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.altKey || click.shiftKey) return null;
  if (link.download || link.reload || !link.href) return null;
  if (link.target && link.target !== "_self") return null;
  let to: URL;
  let from: URL;
  try {
    from = new URL(current);
    to = new URL(link.href, current);
  } catch {
    return null;
  }
  if (to.origin !== from.origin) return null;
  // The router moves to a hash on the same page without preparing anything;
  // the same page WITHOUT a hash is a full soft reload, and that tears the
  // editor down like any other navigation.
  if (to.pathname === from.pathname && to.search === from.search && to.hash) return null;
  return to.href;
}

/**
 * What the tab stores. `loadedAt` is the server copy's updatedAt when the
 * page that wrote the draft was loaded (or last saved) — the conflict check
 * compares against THAT, not against the last keystroke (2026-09-29: `at`
 * was refreshed by every input, so a save made elsewhere before the member's
 * last keystroke was offered as current). `value` is null when the member
 * left with unsaved edits the draft never holds (account settings, a chosen
 * file): the reminder is worth showing, but there is nothing to restore.
 */
export interface StoredDraft<T> {
  version: number;
  at: number;
  loadedAt?: number | null;
  value: T | null;
}

export type DraftOffer =
  | { kind: "none" }
  /** Words to restore; `newer` when the profile was saved elsewhere since. */
  | { kind: "restore"; newer: boolean }
  /** Only unkept edits were unsaved: remind, offer nothing. */
  | { kind: "unkept" };

export const DRAFT_MAX_AGE_MS = 86_400_000;

/**
 * Whether a stored draft is worth a banner, and which one. `current` is the
 * JSON of the page's loaded state: a draft equal to it has been saved since
 * (in this tab or another) and is silently dropped rather than offered as a
 * Restore that changes nothing.
 */
export function draftOffer(
  saved: unknown,
  page: { version: number; now: number; serverUpdatedAt?: number; current: string },
): DraftOffer {
  if (!saved || typeof saved !== "object") return { kind: "none" };
  const draft = saved as Partial<StoredDraft<unknown>>;
  if (draft.version !== page.version || typeof draft.at !== "number" || page.now - draft.at >= DRAFT_MAX_AGE_MS) return { kind: "none" };
  if (draft.value === null || draft.value === undefined) return { kind: "unkept" };
  if (JSON.stringify(draft.value) === page.current) return { kind: "none" };
  const server = page.serverUpdatedAt;
  let newer: boolean;
  if (typeof server !== "number") newer = false;
  // A draft written on a copy that had never been saved: any stamp is newer.
  else if (draft.loadedAt === null) newer = true;
  // Two seconds of slack for the clocks: updatedAt is written from whichever
  // client saved, and after a save in this tab loadedAt is this tab's clock.
  else newer = server - (typeof draft.loadedAt === "number" ? draft.loadedAt : draft.at) > 2000;
  return { kind: "restore", newer };
}

/**
 * The leave dialog's sentence. Work in flight outranks the draft: an upload
 * that navigation cancels is the loss the member cannot undo, while the words
 * persist regardless. A draft is promised only when it was actually written —
 * not when storage refused it, and not when only unkept fields changed.
 */
export function leaveCopy(
  state: { busy: boolean; kept: boolean },
  labels: { leave: string; leaveUnkept?: string; leaveBusy?: string },
): string {
  if (state.busy) return labels.leaveBusy ?? labels.leave;
  return state.kept ? labels.leave : (labels.leaveUnkept ?? labels.leave);
}
