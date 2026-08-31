// Link-shaping rules for member renderings (cards, profile pages, previews).
// The real profile link fields are messy in specific, known ways, and the card
// panel and the profile page must treat them identically — so the rules live
// here rather than twice.

/**
 * Real `portfolio` values are stored without a scheme ("quaint.ch",
 * "www.ikonaut.ch"), so they need one to be a usable href. Anything that
 * already has a scheme is left exactly as stored.
 */
export function href(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

// ---------------------------------------------------------------------------
// Social link cleaner
//
// `socialMedia` is free text, and the real values are wrong in every way a
// person can type a link wrong: malformed hosts ("https://.instagram.com/…"),
// wrong case ("Instagram.com/…"), share-sheet tracking junk ("?igsh=…&
// utm_source=qr", trailing "#"), bare handles ("compostdiv4"), and
// comma-joined pairs ("@karin_seiler, https://www.linkedin.com/in/…").
//
// The cleaner repairs anything it can recognise as a known platform and
// displays it as just the platform name ("instagram", "LinkedIn", "TikTok");
// what it can't recognise it leaves as text rather than guessing a URL.
// ---------------------------------------------------------------------------

export interface SocialLink {
  /** Cleaned absolute URL, or null when the value isn't linkable. */
  href: string | null;
  /** Platform name for recognised hosts, otherwise the raw text. */
  label: string;
}

// Host patterns are deliberately forgiving — they match common misspellings
// ("instagramm", "linkdin", "tiktoc"), and each maps to the canonical host so
// a misspelled domain gets rebuilt into a working URL, not just prettified.
const PLATFORMS: Array<{ label: string; host: string; pattern: RegExp }> = [
  { label: "instagram", host: "www.instagram.com", pattern: /insta\.?gra?m*/i },
  { label: "LinkedIn", host: "www.linkedin.com", pattern: /li?nke?d?[-.]?in/i },
  { label: "TikTok", host: "www.tiktok.com", pattern: /tik[-.]?to[ck]k?|tic[-.]?toc/i },
  { label: "YouTube", host: "www.youtube.com", pattern: /you[-.]?tube|(^|\.)youtu\.be/i },
  { label: "Facebook", host: "www.facebook.com", pattern: /face[-.]?book|(^|\.)fb\.com/i },
  { label: "X", host: "x.com", pattern: /twitter|(^|\.)x\.com/i },
  { label: "Threads", host: "www.threads.net", pattern: /threads\.(net|com)/i },
  { label: "Behance", host: "www.behance.net", pattern: /behance/i },
  { label: "Vimeo", host: "vimeo.com", pattern: /vimeo/i },
  { label: "Pinterest", host: "www.pinterest.com", pattern: /pinterest/i },
  { label: "ArtStation", host: "www.artstation.com", pattern: /art[-.]?station/i },
  { label: "Bluesky", host: "bsky.app", pattern: /(^|\.)bsky\.|blue[-.]?sky/i },
];

/** Clean one value that looks like a URL, or return null if it doesn't. */
function cleanOne(raw: string): SocialLink | null {
  // No dot → a bare handle or plain text, not something we can link.
  if (!/\./.test(raw) || raw.startsWith("@")) return null;

  // Strip the scheme and any stray leading dots ("https://.instagram.com/…"),
  // then cut tracking baggage: everything from "?" or "#" onward.
  const stripped = raw
    .replace(/^https?:\/*/i, "")
    .replace(/^\.+/, "")
    .split(/[?#]/)[0];
  if (!stripped || /\s/.test(stripped)) return null;

  const slash = stripped.indexOf("/");
  const host = slash === -1 ? stripped : stripped.slice(0, slash);
  const path = slash === -1 ? "" : stripped.slice(slash);

  const platform = PLATFORMS.find((p) => p.pattern.test(host));
  if (platform) {
    return { href: `https://${platform.host}${path}`, label: platform.label };
  }
  // A URL, but not a platform we know — link it cleaned, keep the raw label.
  return { href: `https://${host.toLowerCase()}${path}`, label: raw };
}

// ---------------------------------------------------------------------------
// The stored shape
//
// `socialMedia` is ONE comma-joined string on the member document, and stays
// one. The editor now offers a row per link, but a repeatable control does not
// require a repeatable field: splitting on save would strand every profile
// stored before today behind a migration, and the public directory is a
// build-time snapshot, so old and new documents are rendered side by side by
// pages nobody rebuilds on demand. Keeping the single string means there is
// only ever one shape in the wild — the editor's rows are a view of it, the
// same way socialLinks() has always been a view of it for the renderers.
//
// splitSocial/joinSocial are that view, named here rather than in the editor so
// the parse the form uses and the parse the renderers use cannot diverge.
// ---------------------------------------------------------------------------

/**
 * How many link rows the editor offers. The real gate is MAX_SOCIAL_MEDIA
 * below — this only stops the list growing past what anyone reads.
 */
export const MAX_SOCIAL_LINKS = 6;

/** Keep in sync with the `socialMedia` size check in firestore.rules. */
export const MAX_SOCIAL_MEDIA = 500;

/**
 * The entries inside a stored `socialMedia` value, in stored order.
 *
 * Forgiving on purpose: a comma is the separator, so a value pasted as
 * "@me, linkedin.com/in/me" comes back as two entries rather than one broken
 * one. Blanks are dropped — an empty editor row is not a link.
 */
export function splitSocial(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Editor rows back into the one stored value. Runs every entry through
 * splitSocial first, so a row someone pasted a comma-joined pair into stores as
 * two entries instead of surviving as a row that would split on next load
 * anyway. Exact duplicates are dropped: two rows holding the same URL render as
 * the same link twice, which is never what was meant.
 */
export function joinSocial(values: string[]): string {
  const out: string[] = [];
  for (const value of values) {
    for (const entry of splitSocial(value)) {
      if (!out.includes(entry)) out.push(entry);
    }
  }
  return out.join(", ");
}

/**
 * Shape a raw `socialMedia` value into displayable entries. Comma-joined
 * values become one entry each; entries with a null `href` render as plain
 * text. An empty input yields an empty array.
 */
export function socialLinks(raw: string): SocialLink[] {
  return splitSocial(raw).map((part) => cleanOne(part) ?? { href: null, label: part });
}

/**
 * Canonical URL of a member's public profile page, locale-aware. One place
 * rather than three, because the card, the panel and the editor preview all
 * link to the same page and a drifted prefix would 404 only in German.
 */
export function memberHref(lang: string, slug: string): string {
  return lang === "de" ? `/de/members/${slug}` : `/members/${slug}`;
}
