// PROJECTS — A MEMBER'S OPTIONAL GROUPING OF THEIR OWN WORKS (2026-09-23,
// documentation/20260923-projects-design.md).
//
// The second life of the feature. The first (withdrawn 2026-09-01, 95b43d2)
// kept projects as an array on the profile document; this one follows the
// works-on-the-record shape instead: one projects/{projectId} document per
// project, one optional `projectId` on each image record, and the profile's
// `gallery` id list still the ONLY order. A project sits where its first image
// sits; contiguousOrder() is what makes that true even for stored ids that
// are not adjacent.
//
// PURE, like galleryRecords.ts: no firebase import. The build, the member
// page, the editor, its preview, the lightbox and seo.ts all ask this module,
// so every rule about projects is written here once and unit-tested without
// an emulator.
import type { Lang } from "../i18n/utils";
import { memberHref, workLink } from "./links.ts";

// Keep in sync with validProject() / validAffiliation() in firestore.rules.
export const MAX_PROJECT_TITLE = 100;
export const MAX_PROJECT_DESCRIPTION = 600;
export const MAX_PROJECT_LINK = 200;
export const MAX_AFFILIATIONS = 10;
export const MAX_AFFILIATION_NAME = 100;
export const MAX_AFFILIATION_URL = 200;

/** One stored affiliation: a name with an optional scheme-less link, or a member credit. */
export type AffiliationRecord = { name: string; url?: string } | { memberUid: string; name: string };

/** A projects/{projectId} document with its id attached. */
export interface ProjectRecord {
  projectId: string;
  ownerUid: string;
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
  affiliations?: AffiliationRecord[];
}

/** An affiliation as renderers see it. */
export interface ProjectAffiliation {
  name: string;
  /** Absolute external href (through workLink), for a name entry that had a linkable url. */
  href?: string;
  /** Present on a member credit. */
  memberUid?: string;
  /** Set by resolveMemberCredits(), and only while that member is in the directory. */
  memberSlug?: string;
}

/** A project as the view model carries it: texts raw in both locales, links absolute. */
export interface ProfileProject {
  id: string;
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  /** Absolute href, through workLink(). */
  link?: string;
  affiliations: ProjectAffiliation[];
}

export interface WorkSection<W> {
  /** Absent for a run of works that belong to no project. */
  project?: ProfileProject;
  works: W[];
}

export type EditorBlock =
  | { kind: "image"; index: number }
  | { kind: "project"; projectId: string; indices: number[] };

/** The member-editable fields of a project, as written to Firestore. */
export interface ProjectFields {
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
  affiliations?: AffiliationRecord[];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}

export function toProfileProject(rec: ProjectRecord): ProfileProject {
  const p: ProfileProject = { id: rec.projectId, affiliations: [] };
  const title = text(rec.title);
  const titleDe = text(rec.titleDe);
  const description = text(rec.description);
  const descriptionDe = text(rec.descriptionDe);
  const link = workLink(rec.link);
  if (title) p.title = title;
  if (titleDe) p.titleDe = titleDe;
  if (description) p.description = description;
  if (descriptionDe) p.descriptionDe = descriptionDe;
  if (link) p.link = link;
  for (const a of Array.isArray(rec.affiliations) ? rec.affiliations : []) {
    const name = text(a?.name);
    if (!name) continue;
    if ("memberUid" in a && text(a.memberUid)) {
      p.affiliations.push({ name, memberUid: a.memberUid });
    } else {
      const href = workLink((a as { url?: string }).url);
      p.affiliations.push(href ? { name, href } : { name });
    }
  }
  return p;
}

/**
 * The member's own projects. Someone else's id on an image is ignored here the
 * same way orderedGalleryItems() ignores someone else's image: the rules only
 * judge shape, the reader judges ownership.
 */
export function ownProjects(uid: string, records: readonly ProjectRecord[]): ProfileProject[] {
  return records.filter((r) => r.ownerUid === uid).map(toProfileProject);
}

/**
 * Gathers every item of a group at the position of its first item; items with
 * no group keep their place. The editor keeps a project's images adjacent, but
 * a Save that failed halfway, or a reorder persisted before the membership was
 * saved, can store them apart — readers must not scatter a project for that.
 */
export function contiguousOrder<T>(items: readonly T[], key: (item: T) => string | undefined): T[] {
  const out: T[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (k === undefined) {
      out.push(item);
      continue;
    }
    if (placed.has(k)) continue;
    placed.add(k);
    out.push(...items.filter((other) => key(other) === k));
  }
  return out;
}

/** The works in display order, cut into project blocks and runs of loose works. */
export function groupWorks<W extends { projectId?: string }>(
  works: readonly W[],
  projects: readonly ProfileProject[],
): WorkSection<W>[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const key = (w: W) => (w.projectId && byId.has(w.projectId) ? w.projectId : undefined);
  const sections: WorkSection<W>[] = [];
  for (const work of contiguousOrder(works, key)) {
    const id = key(work);
    const last = sections.at(-1);
    if (last && last.project?.id === id) last.works.push(work);
    else sections.push({ project: id ? byId.get(id) : undefined, works: [work] });
  }
  return sections;
}

/** A run of the member page's gallery: loose works, one project, or the projects slider. */
export type PageSection<W> = WorkSection<W> | { slider: WorkSection<W>[] };

/**
 * THE PROJECTS SLIDER'S CUT (2026-09-25, Josh: projects as a horizontal
 * slider, one project per step). With two or more projects, every project
 * block is gathered into ONE slider, standing where the member's first
 * project stands; the loose works keep their own order around it. With one
 * project, or none, the sections pass through untouched, because a slider of
 * one project is just that project with controls that do nothing.
 *
 * The slider's projects keep the member's order among themselves. What moves
 * is only a loose run that sat BETWEEN two projects: it now follows the
 * slider. That is the price of one slider instead of several, and the reason
 * it is paid: a page of alternating single-project "sliders" would be a list
 * of projects with arrows on it.
 */
export function withProjectSlider<W>(sections: WorkSection<W>[]): PageSection<W>[] {
  const projects = sections.filter((s) => s.project);
  if (projects.length < 2) return sections;
  const out: PageSection<W>[] = [];
  for (const s of sections) {
    if (!s.project) out.push(s);
    else if (s === projects[0]) out.push({ slider: projects });
  }
  return out;
}

/**
 * THE LINK A WORK SHOWS AS "THIS PIECE ON THE MAKER'S SITE" (2026-09-23, Josh:
 * "images inherit it. if there is a link in the image tab it takes
 * precedent"). The project's link fills the siteLink slot — the member's own
 * page — never `link`, which is where the picture was published.
 */
export function inheritedSiteLink(own: string | undefined, project: { link?: string } | undefined): string | undefined {
  return own ?? project?.link;
}

/** Both ways, like profileRole(): a German-only title still shows on the English page. */
export function projectTitle(p: { title?: string; titleDe?: string }, lang: Lang): string | undefined {
  return lang === "de" ? (p.titleDe ?? p.title) : (p.title ?? p.titleDe);
}

export function projectDescription(p: { description?: string; descriptionDe?: string }, lang: Lang): string | undefined {
  return lang === "de" ? (p.descriptionDe ?? p.description) : (p.description ?? p.descriptionDe);
}

/**
 * Member credits get a slug only while the member is in the directory. A
 * credit to a member who hid their profile or left stays their stored name,
 * as plain text — never a link to a page that no longer exists.
 */
export function resolveMemberCredits(p: ProfileProject, slugByUid: ReadonlyMap<string, string>): ProfileProject {
  return {
    ...p,
    affiliations: p.affiliations.map((a) => {
      const slug = a.memberUid ? slugByUid.get(a.memberUid) : undefined;
      return slug ? { ...a, memberSlug: slug } : a;
    }),
  };
}

export function affiliationHref(a: ProjectAffiliation, lang: string): string | undefined {
  return a.memberSlug ? memberHref(lang, a.memberSlug) : a.href;
}

/**
 * What a lightbox trigger carries about its project, as data-pswp-* values.
 * Strings only, because they travel as attributes: the lightbox script is a
 * module that renders from the trigger's dataset (see lightboxText.ts).
 */
export function projectSlideData(
  p: ProfileProject | undefined,
  lang: Lang,
): { project?: string; projectLink?: string; affiliations?: string } {
  if (!p) return {};
  const out: { project?: string; projectLink?: string; affiliations?: string } = {};
  const title = projectTitle(p, lang);
  if (title) {
    out.project = title;
    if (p.link) out.projectLink = p.link;
  }
  if (p.affiliations.length) {
    out.affiliations = JSON.stringify(
      p.affiliations.map((a) => {
        const href = affiliationHref(a, lang);
        return href ? { name: a.name, href } : { name: a.name };
      }),
    );
  }
  return out;
}

/** What Save writes: trimmed, empties dropped, schemes stripped, affiliations capped. */
export function projectFields(p: ProjectFields): ProjectFields {
  const out: ProjectFields = {};
  const title = text(p.title);
  const titleDe = text(p.titleDe);
  const description = text(p.description);
  const descriptionDe = text(p.descriptionDe);
  const link = text(p.link);
  if (title) out.title = title.slice(0, MAX_PROJECT_TITLE);
  if (titleDe) out.titleDe = titleDe.slice(0, MAX_PROJECT_TITLE);
  if (description) out.description = description.slice(0, MAX_PROJECT_DESCRIPTION);
  if (descriptionDe) out.descriptionDe = descriptionDe.slice(0, MAX_PROJECT_DESCRIPTION);
  if (link) out.link = stripScheme(link).slice(0, MAX_PROJECT_LINK);
  const affiliations: AffiliationRecord[] = [];
  for (const a of p.affiliations ?? []) {
    const name = text(a.name)?.slice(0, MAX_AFFILIATION_NAME);
    if (!name) continue;
    if ("memberUid" in a && text(a.memberUid)) {
      affiliations.push({ memberUid: a.memberUid, name });
    } else {
      const url = text((a as { url?: string }).url);
      affiliations.push(url ? { name, url: stripScheme(url).slice(0, MAX_AFFILIATION_URL) } : { name });
    }
  }
  if (affiliations.length) out.affiliations = affiliations.slice(0, MAX_AFFILIATIONS);
  return out;
}

/**
 * The editor's linear list: loose image rows and project blocks in gallery
 * order, then projects that hold no image yet — a new, empty block waits at
 * the end until something is dragged into it. An image naming an unknown
 * project is a loose row.
 */
export function editorBlocks(
  gallery: readonly { projectId?: string }[],
  projects: readonly { projectId: string }[],
): EditorBlock[] {
  const known = new Set(projects.map((p) => p.projectId));
  const blocks: EditorBlock[] = [];
  const blockOf = new Map<string, { kind: "project"; projectId: string; indices: number[] }>();
  gallery.forEach((item, index) => {
    const id = item.projectId && known.has(item.projectId) ? item.projectId : undefined;
    if (!id) {
      blocks.push({ kind: "image", index });
      return;
    }
    const existing = blockOf.get(id);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const block = { kind: "project" as const, projectId: id, indices: [index] };
    blockOf.set(id, block);
    blocks.push(block);
  });
  for (const p of projects) {
    if (!blockOf.has(p.projectId)) blocks.push({ kind: "project", projectId: p.projectId, indices: [] });
  }
  return blocks;
}

/** Projects no gallery image names — Save deletes these last. */
export function emptyProjectIds(
  gallery: readonly { projectId?: string }[],
  projects: readonly { projectId: string }[],
): string[] {
  const used = new Set(gallery.map((g) => g.projectId).filter(Boolean));
  return projects.map((p) => p.projectId).filter((id) => !used.has(id));
}
