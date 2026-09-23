// VIDEO WORKS ON THE PAGE (2026-09-23, release 1 of
// documentation/20260923-motion-works-design.md).
//
// PURE, like galleryRecords.ts: the build, the editor and the lightbox all
// read this, and tests/unit/embed.test.mjs pins it without a browser.
//
// The server decides what a pasted link means (functions/src/embedUrl.ts) and
// stores only a provider and an id. This module turns that id back into the
// one player URL we are willing to put in an iframe — never anything the
// member typed — and refuses an id that does not look like one, so even a
// record written by a buggy server cannot smuggle a path into the src.

export type EmbedProvider = "youtube" | "vimeo";

export interface EmbedRef {
  provider: EmbedProvider;
  videoId: string;
  /** Vimeo's `h=` for an unlisted video. */
  hash?: string;
}

/** What a work IS. Absent on a record means "still". Mirrors ImageDoc.media in functions/src/types.ts. */
export type WorkMedia = "still" | "loop" | "embed";

// Keep in sync with functions/src/embedUrl.ts and validEmbed() in firestore.rules.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;

/** The embed as stored, or null when it is absent or not something we would play. */
export function validEmbed(value: unknown): EmbedRef | null {
  if (!value || typeof value !== "object") return null;
  const { provider, videoId, hash } = value as Record<string, unknown>;
  if (provider === "youtube" && typeof videoId === "string" && YOUTUBE_ID.test(videoId) && hash === undefined) {
    return { provider, videoId };
  }
  if (provider === "vimeo" && typeof videoId === "string" && VIMEO_ID.test(videoId)) {
    if (hash === undefined) return { provider, videoId };
    if (typeof hash === "string" && VIMEO_HASH.test(hash)) return { provider, videoId, hash };
  }
  return null;
}

/**
 * The iframe src, built from the id alone.
 *
 * `youtube-nocookie.com` and Vimeo's `dnt=1` are the privacy-reduced players
 * (the privacy page names both platforms). `autoplay=1` because the iframe
 * only exists once the visitor has pressed play — pressing twice would be
 * the alternative.
 */
export function embedPlayerUrl(ref: EmbedRef): string {
  if (ref.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${ref.videoId}?autoplay=1&rel=0&playsinline=1`;
  }
  const hash = ref.hash ? `&h=${ref.hash}` : "";
  return `https://player.vimeo.com/video/${ref.videoId}?dnt=1&autoplay=1${hash}`;
}

/**
 * The same player, for structured data: `embedUrl` on a VideoObject names the
 * player, not a playing one, so no autoplay.
 */
export function embedPageUrl(ref: EmbedRef): string {
  return ref.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${ref.videoId}`
    : `https://player.vimeo.com/video/${ref.videoId}?dnt=1${ref.hash ? `&h=${ref.hash}` : ""}`;
}

/** "YouTube" / "Vimeo" — proper names, the same in both languages. */
export function providerName(provider: EmbedProvider): string {
  return provider === "youtube" ? "YouTube" : "Vimeo";
}

/**
 * The embed's `data-*` set on a lightbox trigger or wall tile, or {} for a
 * still. One place, so the wall, the gallery card and the member page cannot
 * disagree about the attribute names the lightbox reads.
 */
export function embedDataAttrs(embed: EmbedRef | undefined): Record<string, string> {
  if (!embed) return {};
  return {
    "data-pswp-embed": embed.provider,
    "data-pswp-embed-id": embed.videoId,
    ...(embed.hash ? { "data-pswp-embed-hash": embed.hash } : {}),
  };
}

/** Reads embedDataAttrs() back off an element's dataset. */
export function embedFromDataset(dataset: DOMStringMap | undefined): EmbedRef | null {
  if (!dataset?.pswpEmbed) return null;
  return validEmbed({
    provider: dataset.pswpEmbed,
    videoId: dataset.pswpEmbedId,
    ...(dataset.pswpEmbedHash ? { hash: dataset.pswpEmbedHash } : {}),
  });
}
