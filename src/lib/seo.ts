// What the site says to search engines, and to whom every picture belongs.
//
// THE POINT (2026-09-10, Josh: "SEO wise it would make sense to add a link to
// each image that links back to the portfolios of one's own portfolio site").
// The visible answer to that already existed: the member page links the
// portfolio as a plain followed anchor. What did not exist was the
// machine-readable form — an ImageObject per work whose `creator` is a Person
// whose `url` is the member's own site. That is what Google Images reads for
// its creator/credit panel, and it is done here without changing what a visitor
// clicks: the tile still opens the picture, the name still goes to the person.
//
// Everything in this file is a pure function over view models, so the shapes
// are pinned by tests/unit/seo.test.mjs rather than by reading built HTML.
import { href, memberHref, socialLinks } from "./links.ts";

/**
 * A member page's canonical absolute URL. memberHref() gives the site-relative
 * path without a trailing slash, which is fine for an <a>; the canonical the
 * built page declares HAS one (Astro's directory format), and the Person's
 * @id is derived from it. The community page has to name the same @id, so it
 * builds the URL here rather than from memberHref() directly.
 */
export function memberPageUrl(lang: string, slug: string, site: string): string {
  return new URL(`${memberHref(lang, slug)}/`, site).href;
}

export type Hreflang = "en" | "de" | "x-default";

export interface AlternateLink {
  hreflang: Hreflang;
  href: string;
}

/**
 * The English and German twins of one path, plus `x-default` (English, the
 * unprefixed locale). Given either twin, returns the same list — so the two
 * pages point at each other symmetrically, which is what hreflang requires to
 * count at all.
 *
 * Every public page exists in both locales (src/pages/[...lang]/), so this
 * does not need to know whether the twin was built. The sitemap integration
 * checks that for its own alternates; see astro.config.mjs.
 */
export function alternateLinks(pathname: string, site: string): AlternateLink[] {
  const base = pathname === "/de" || pathname === "/de/" ? "/" : pathname.replace(/^\/de(?=\/)/, "");
  const en = new URL(base, site).href;
  const de = new URL(base === "/" ? "/de/" : `/de${base}`, site).href;
  return [
    { hreflang: "en", href: en },
    { hreflang: "de", href: de },
    { hreflang: "x-default", href: en },
  ];
}

/**
 * "Ada Lovelace — Scientific illustrator, Zurich, Switzerland — VSCN".
 *
 * The title used to be the name alone. Nobody searches a stranger's name; they
 * search "scientific illustrator Zurich", and the <title> is where those words
 * weigh most. Role and location are the member's own free text, so an empty
 * one simply drops out of the line.
 */
export function memberTitle(m: { displayName: string; role: string; location: string }): string {
  const what = [m.role, m.location].map((s) => s.trim()).filter(Boolean).join(", ");
  return [m.displayName.trim(), what, "VSCN"].filter(Boolean).join(" — ");
}

/** The fields of a member that the structured data reads. A subset of MemberView. */
export interface SeoMember {
  displayName: string;
  role?: string;
  bio?: string;
  affiliation?: string;
  location?: string;
  portfolio: string;
  socialMedia: string;
  photoURL?: string;
}

/** One work, with its texts already picked for the page's locale. */
export interface SeoWork {
  /** The stored original — what the lightbox opens and the tile's anchor points at. */
  url: string;
  /** The on-site rendition the page actually embeds, if the caller has one. Site-relative is fine. */
  thumbnailUrl?: string;
  width: number;
  height: number;
  caption?: string;
  description?: string;
  /** Absolute, already filtered by workLink(): where this image appeared. */
  link?: string;
}

type Node = Record<string, unknown>;

/** Drops keys whose value is undefined, null, "" or [] — schema.org has no use for an empty property. */
function compact(node: Node): Node {
  return Object.fromEntries(
    Object.entries(node).filter(([, v]) => {
      if (v === undefined || v === null || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );
}

function personId(memberUrl: string): string {
  return `${memberUrl}#person`;
}

/**
 * The person's `url` is THEIR site when they have one, and the VSCN page
 * otherwise. `sameAs` gathers every other place that is them: linkable socials
 * (unrecognised free text is dropped, exactly as the page drops it), and the
 * VSCN page whenever it is not already the `url`.
 */
function personNode(member: SeoMember, memberUrl: string): Node {
  const portfolio = member.portfolio.trim() ? href(member.portfolio.trim()) : undefined;
  const socials = socialLinks(member.socialMedia).flatMap((s) => (s.href ? [s.href] : []));
  return compact({
    "@type": "Person",
    "@id": personId(memberUrl),
    name: member.displayName,
    url: portfolio ?? memberUrl,
    sameAs: portfolio ? [...socials, memberUrl] : socials,
    jobTitle: member.role?.trim(),
    description: member.bio?.trim(),
    image: member.photoURL,
    worksFor: member.affiliation?.trim()
      ? { "@type": "Organization", name: member.affiliation.trim() }
      : undefined,
    homeLocation: member.location?.trim() ? { "@type": "Place", name: member.location.trim() } : undefined,
  });
}

/**
 * One picture. `creator` is a reference, not a copy — the caller decides how
 * much of the person to inline. `creditText` and `copyrightNotice` are what
 * Google Images prints beside a result; the name is the whole credit here, as
 * it is on every surface of the site.
 */
function imageNode(work: SeoWork, creator: Node, creatorName: string, site: string): Node {
  return compact({
    "@type": "ImageObject",
    contentUrl: work.url,
    thumbnailUrl: work.thumbnailUrl ? new URL(work.thumbnailUrl, site).href : undefined,
    name: work.caption?.trim(),
    description: work.description?.trim(),
    width: work.width,
    height: work.height,
    creator,
    creditText: creatorName,
    copyrightNotice: `© ${creatorName}`,
    mainEntityOfPage: work.link,
  });
}

/**
 * The member page: a ProfilePage whose mainEntity is the Person, followed by
 * one ImageObject per work pointing back at that Person by @id. Google's
 * ProfilePage guidance wants the person nested, not referenced, so it is.
 */
export function memberPageJsonLd(input: {
  member: SeoMember;
  works: SeoWork[];
  /** Absolute canonical URL of this page. */
  pageUrl: string;
  site: string;
  description: string;
}): Node {
  const { member, works, pageUrl, site, description } = input;
  const person = personNode(member, pageUrl);
  const ref = { "@id": personId(pageUrl) };
  return {
    "@context": "https://schema.org",
    "@graph": [
      compact({
        "@type": "ProfilePage",
        "@id": pageUrl,
        url: pageUrl,
        name: member.displayName,
        description,
        mainEntity: person,
      }),
      ...works.map((w) => imageNode(w, ref, member.displayName, site)),
    ],
  };
}

/**
 * The community page: a CollectionPage whose parts are every image on it.
 * There is no page for the person here, so each creator is a compact Person
 * carrying the two things that matter — a stable @id shared with their own
 * page's node, and the url that is their site.
 */
export function communityJsonLd(input: {
  entries: { member: SeoMember & { memberUrl: string }; works: SeoWork[] }[];
  pageUrl: string;
  site: string;
  name: string;
  description: string;
}): Node {
  const { entries, pageUrl, site, name, description } = input;
  const hasPart = entries.flatMap(({ member, works }) => {
    const portfolio = member.portfolio.trim() ? href(member.portfolio.trim()) : undefined;
    const creator = {
      "@type": "Person",
      "@id": personId(member.memberUrl),
      name: member.displayName,
      url: portfolio ?? member.memberUrl,
    };
    return works.map((w) => imageNode(w, creator, member.displayName, site));
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      compact({
        "@type": "CollectionPage",
        "@id": pageUrl,
        url: pageUrl,
        name,
        description,
        hasPart,
      }),
    ],
  };
}

/**
 * Serialises for a <script type="application/ld+json"> body. JSON.stringify
 * leaves `<` alone, and every string in here is member-authored — a bio
 * containing "</script>" would otherwise end the block and start markup. The
 * three characters that can matter inside a script element are written as
 * JSON unicode escapes, which any JSON parser reads back unchanged.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
