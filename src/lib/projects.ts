// A member's projects: named bodies of work, each with a link.
//
// A project is INDEPENDENT of the gallery. Members have work that lives
// somewhere else entirely — a published paper, an exhibition, a studio site —
// and being able to name and link that without first having an image to show
// for it is the point of the type. Gallery images may tag into a project
// (GalleryItem.projectId), but the relationship is optional in both
// directions.
//
// Keep in sync with validProjects() in firestore.rules.

/** Keep in sync with the unrolled item checks in firestore.rules. */
export const MAX_PROJECTS = 12;
export const MAX_PROJECT_TITLE = 100;
export const MAX_PROJECT_URL = 200;
export const MAX_PROJECT_DESCRIPTION = 300;

export interface ProjectItem {
  /**
   * Stable identifier, generated once on create and never rewritten — it is
   * what a gallery item's `projectId` points at, so regenerating it would
   * silently orphan every image tagged to the project.
   */
  id: string;
  title: string;
  url: string;
  description?: string;
}

/**
 * Lowercase base36, which is the shape validProjects() in firestore.rules
 * accepts. Same recipe as the gallery's Storage filenames: a timestamp for
 * rough ordering, a random tail so two projects created in the same
 * millisecond cannot collide.
 */
export function newProjectId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const ID_PATTERN = /^[a-z0-9-]{4,32}$/;

/**
 * Trims, truncates and drops rows that say nothing.
 *
 * A row needs BOTH a title and a link to survive: a title with no URL is not a
 * project, it is a word, and a URL with no title has nothing to render as its
 * label. The editor keeps half-filled rows on screen while they are being
 * typed; this is the gate they pass on the way to Firestore.
 */
export function normalizeProjects(value: unknown): ProjectItem[] {
  if (!Array.isArray(value)) return [];
  const out: ProjectItem[] = [];
  // Ids have to be unique to be usable as tags: two projects sharing one would
  // make an image's credit resolve to whichever the lookup happened to keep.
  // Firestore rules cannot check a list against itself, so the guarantee is
  // made here, on the way in.
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<ProjectItem>;
    let id = typeof item.id === "string" && ID_PATTERN.test(item.id) ? item.id : newProjectId();
    while (seen.has(id)) id = newProjectId();
    const title = (item.title ?? "").trim().slice(0, MAX_PROJECT_TITLE);
    const url = (item.url ?? "").trim().slice(0, MAX_PROJECT_URL);
    if (!title || !url) continue;
    const description = (item.description ?? "").trim().slice(0, MAX_PROJECT_DESCRIPTION);
    seen.add(id);
    out.push({ id, title, url, ...(description ? { description } : {}) });
    if (out.length >= MAX_PROJECTS) break;
  }
  return out;
}
