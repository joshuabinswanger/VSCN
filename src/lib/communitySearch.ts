// THE DIRECTORY'S SEARCH (2026-10-16, Josh: "implement a search function for
// names projects and images. it should sit beside the other pills in the
// bottom"). A fourth drop-up in the community bar: one field, and under it
// three short lists — the people, the projects and the pictures the words
// match. Every result is a way to the member's page; a project or a picture
// carries ?project= / ?work= so the page arrives showing it (see
// revealLinkedWork in members/[slug].astro).
//
// The index is built at render time (CommunityGrid.astro) and printed into
// the page as JSON, so searching costs no request and works on the static
// snapshot every other view reads. Pure from here down: the controller hands
// this module the index and the query and draws what comes back.

export interface SearchPerson {
  name: string;
  role: string;
  href: string;
  /** The profile picture, token stripped; empty when there is none. */
  photo: string;
  tags: string[];
}

export interface SearchProject {
  title: string;
  member: string;
  href: string;
  tags: string[];
}

export interface SearchImage {
  /** The wall tile's data-work key, which is where the thumbnail comes from. */
  key: string;
  caption: string;
  member: string;
  project: string;
  href: string;
  tags: string[];
}

export interface SearchIndex {
  people: SearchPerson[];
  projects: SearchProject[];
  images: SearchImage[];
}

export interface SearchResults {
  people: SearchPerson[];
  projects: SearchProject[];
  images: SearchImage[];
}

/** How many of each the panel lists. */
export const SEARCH_LIMITS = { people: 6, projects: 6, images: 12 } as const;

/** Lowercase, accents gone, ß as ss — "Müller" is found by "muller". */
export function fold(s: string): string {
  return (s ?? "")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The query's words; every one of them has to match somewhere. */
export function queryWords(q: string): string[] {
  return fold(q).split(/\s+/).filter(Boolean);
}

/**
 * How well `words` fit an entry whose own name is `primary` and whose other
 * words are `rest`, or -1 for no match. Every word must be in one of them;
 * the score prefers a name that STARTS with the query, then a word of the
 * name that does, then anything else — so "an" puts Anna before Johanna.
 */
export function scoreEntry(words: string[], primary: string, rest: string[]): number {
  if (!words.length) return -1;
  const name = fold(primary);
  const hay = [name, ...rest.map(fold)].join("\n");
  if (!words.every((w) => hay.includes(w))) return -1;
  const phrase = words.join(" ");
  if (name.startsWith(phrase)) return 3;
  if (name.split(/[^\p{L}\p{N}]+/u).some((part) => part.startsWith(words[0]))) return 2;
  if (words.every((w) => name.includes(w))) return 1;
  return 0;
}

function ranked<T>(items: T[], score: (item: T) => number, limit: number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.item);
}

/** The three lists for `query`; all empty for a blank one. */
export function searchDirectory(
  index: SearchIndex,
  query: string,
  limits: { people: number; projects: number; images: number } = SEARCH_LIMITS,
): SearchResults {
  const words = queryWords(query);
  if (!words.length) return { people: [], projects: [], images: [] };
  return {
    people: ranked(index.people, (p) => scoreEntry(words, p.name, [p.role, ...p.tags]), limits.people),
    projects: ranked(
      index.projects,
      (p) => scoreEntry(words, p.title, [p.member, ...p.tags]),
      limits.projects,
    ),
    images: ranked(
      index.images,
      (w) => scoreEntry(words, w.caption, [w.project, w.member, ...w.tags]),
      limits.images,
    ),
  };
}

/**
 * A stored picture's identity, from its download URL: the object's own path
 * (users/{uid}/gallery/{imageId}.webp), which no other work shares. The
 * directory links a picture by it and the member page finds the picture by
 * it — the two pages order a member's works differently (by score here, by
 * the member's hand there), so a position would point at the wrong one.
 */
export function workKey(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    const at = path.indexOf("/o/");
    return at >= 0 ? path.slice(at + 3) : path;
  } catch {
    return url;
  }
}
