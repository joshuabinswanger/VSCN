// Turns a stored publicProfiles document into the shape the directory card and
// the member profile page render.
//
// This is the build-time producer of the same view model the profile editor
// produces from live form state (see profileView.ts). Naming one shape between
// them is what keeps the editor's preview honest: both paths feed the identical
// renderer, so the preview cannot drift from what a visitor gets.

import type { PublicProfileDoc } from "./firestore.ts";
import type { ProfileViewModel, ProfileWork } from "./profileView.ts";
import { workLink } from "./links.ts";

export interface MemberViewBase extends ProfileViewModel {
  /** The profile's uid. Stable, but not what appears in the URL. */
  id: string;
  /** Absent on profiles created before member types existed. */
  memberType: string;
  /**
   * One-line version of the bio for the card's caption band. The card has room
   * for a line, not a paragraph; the full text belongs to the profile page.
   */
  caption: string;
}

/**
 * A member with its URL slug resolved. Separate from MemberViewBase because a
 * slug cannot be derived from one profile alone — deduplication needs to see
 * the whole collection — so the type makes it impossible to hold a
 * "MemberView" that never went through resolveSlugs() — which assignSlugs()
 * is now just the empty-table case of.
 */
export interface MemberView extends MemberViewBase {
  /** URL segment. From slugs/ when a row exists, else derived. See resolveSlugs(). */
  slug: string;
}

/**
 * German transliteration, applied BEFORE diacritics are stripped. This ordering
 * is the whole point: "Röttele" must become "roettele", and generic diacritic
 * removal would give "rottele". Anything not listed falls through to the NFD
 * pass below, so "José" still becomes "jose".
 */
const TRANSLITERATE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "ae", Ö: "oe", Ü: "ue", ß: "ss",
  å: "a", æ: "ae", ø: "oe", œ: "oe", Å: "a", Æ: "ae", Ø: "oe", Œ: "oe",
};

/** Longest slug we will emit, before any dedup suffix. */
const SLUG_MAX = 60;

export function slugifyName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/[äöüÄÖÜßåæøœÅÆØŒ]/g, (ch) => TRANSLITERATE[ch] ?? ch)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    // The slice can land mid-word and leave a trailing separator.
    .replace(/-+$/, "");
}

/**
 * One slug per member. The `table` is slugs/ from Firestore (uid → current
 * slug), owned by the onPublicProfileWritten function; a member with a row
 * gets exactly that slug. A member with no row yet (inactive at migration,
 * never saved since) falls back to the derived form, deduplicated against
 * everything already taken. Fallback runs in uid order so it is stable
 * between builds.
 */
export function resolveSlugs(members: MemberViewBase[], table: Map<string, string>): MemberView[] {
  const used = new Set(table.values());
  const resolved = new Map<string, string>();
  const inUidOrder = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const member of inUidOrder) {
    const stored = table.get(member.id);
    if (stored) {
      resolved.set(member.id, stored);
      continue;
    }
    const base = slugifyName(member.displayName) || member.id.toLowerCase();
    let candidate = base;
    let n = 1;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    used.add(candidate);
    resolved.set(member.id, candidate);
  }

  return members.map((member) => ({ ...member, slug: resolved.get(member.id) as string }));
}

/**
 * The no-table case: every slug derived. This is what the migration used to
 * SEED slugs/, so that the stored table started out identical to the URLs
 * the site had been serving — nobody's link moved.
 */
export function assignSlugs(members: MemberViewBase[]): MemberView[] {
  return resolveSlugs(members, new Map());
}

/**
 * First sentence of the bio, or a word-boundary trim. Ported from
 * scripts/gen-proto-real-data.mjs, which produced the prototype's captions —
 * keeping the same rule means the graduated cards read exactly like the
 * prototype they were designed in.
 */
export function caption(bio: string, max = 95): string {
  const text = (bio || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const stop = text.search(/[.!?](\s|$)/);
  if (stop > 0 && stop + 1 <= max) return text.slice(0, stop + 1).trim();
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  // A single word longer than `max` has no space to break at; hard-cut rather
  // than return the whole paragraph.
  return `${text.slice(0, cut > 0 ? cut : max).trim()}…`;
}

/**
 * Drops the `token` query parameter from a Firebase Storage URL.
 *
 * Two reasons, both real: the build-time image optimiser keys its cache on the
 * URL, so a rotating token would defeat it; and a token baked into generated
 * markup is a credential published in the page. Objects have to be publicly
 * readable for this to work, which they are — MemberCard has shipped the same
 * treatment for months.
 */
export function stripStorageToken(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "firebasestorage.googleapis.com") {
      u.searchParams.delete("token");
      return u.toString();
    }
  } catch {
    // Not a valid URL. Return it untouched rather than inventing one — a
    // malformed stored value should fail visibly, not silently become
    // something else.
  }
  return url;
}

/**
 * Gallery items that are safe to lay out. Width and height must be real
 * numbers, because the card's frame takes its aspect ratio from the first
 * image — a zero would collapse the frame to nothing.
 *
 * Token stripping happens here, so every consumer of a MemberView gets
 * render-ready URLs and no page has to remember to do it.
 */
function works(doc: PublicProfileDoc): ProfileWork[] {
  const gallery = Array.isArray(doc.gallery) ? doc.gallery : [];
  return gallery
    .filter((g) => g?.url && g.width > 0 && g.height > 0)
    .map((g) => {
      return {
        url: stripStorageToken(g.url),
        width: g.width,
        height: g.height,
        caption: g.caption,
        color: g.color,
        description: (g.description ?? "").trim() || undefined,
        link: workLink(g.link),
      };
    });
}

export function toMemberViewBase(uid: string, doc: PublicProfileDoc): MemberViewBase {
  const bio = (doc.bio ?? "").trim();
  return {
    id: uid,
    displayName: (doc.displayName ?? "").trim(),
    photoURL: (doc.photoURL ?? "").trim() || undefined,
    photoColor: doc.photoColor,
    role: (doc.role ?? "").trim(),
    bio,
    caption: caption(bio),
    affiliation: (doc.affiliation ?? "").trim(),
    location: (doc.location ?? "").trim(),
    languages: Array.isArray(doc.languages) ? doc.languages.filter(Boolean) : [],
    visualNeeds: Array.isArray(doc.visualNeeds) ? doc.visualNeeds.filter(Boolean) : [],
    tags: Array.isArray(doc.tags) ? doc.tags.filter(Boolean) : [],
    openTo: Array.isArray(doc.openTo) ? doc.openTo.filter(Boolean) : [],
    portfolio: (doc.portfolio ?? "").trim(),
    socialMedia: (doc.socialMedia ?? "").trim(),
    memberType: doc.memberType ?? "",
    works: works(doc),
  };
}

/**
 * Whether this member's card can show artwork. The one thing that decides
 * between the image card and the typographic one, so it is named rather than
 * being an inline `works.length > 0` in the grid.
 */
export function hasArtwork(m: MemberViewBase): boolean {
  return m.works.length > 0;
}

/**
 * Whether the card has anything to disclose beyond its own face (name, role,
 * artwork). Shared by the detail panel (render at all?) and the typographic
 * card (is there a caption band?) so the rule is not written twice.
 */
export function hasDetail(m: ProfileViewModel): boolean {
  return Boolean(m.bio.trim() || m.portfolio.trim() || m.socialMedia.trim() || m.tags.length > 0);
}

/**
 * How filled-out a profile is: one point per substantive field, equally
 * weighted — there is no principled exchange rate between a bio and a
 * portfolio link, so none is invented. The directory's index section orders by
 * this, descending, so the names with something behind them surface first and
 * the bare ones sink to the bottom rather than being scattered by the deal.
 */
export function completeness(m: MemberViewBase): number {
  return [
    m.role.trim(),
    m.bio.trim(),
    m.photoURL,
    m.portfolio,
    m.socialMedia,
    m.memberType,
    m.tags.length > 0,
    m.openTo.length > 0,
    // Was nine points; projects were withdrawn (2026-09-01) and took the ninth
    // with them. Only the RANKING matters — the index section sorts on this and
    // nothing compares the number to a threshold — so losing a point costs
    // nothing but the ceiling.
  ].filter(Boolean).length;
}
