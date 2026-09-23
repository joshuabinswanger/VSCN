// WHAT A PASTED VIDEO LINK MEANS (2026-09-23, release 1 of
// documentation/20260923-motion-works-design.md). Pure — no Firebase, no
// network — so tests/unit/embedUrl.test.mjs can pin every accepted and
// refused form without an emulator.
//
// THE ID, NEVER THE URL. A link is reduced to a provider and an id here, and
// only those are stored. Every player URL the site ever renders is rebuilt
// from them (embedPlayerUrl in src/lib/embed.ts), so nothing a member typed
// can become an iframe src.

export type EmbedProvider = "youtube" | "vimeo";

export interface EmbedRef {
  provider: EmbedProvider;
  videoId: string;
  /** Vimeo's `h=` for an unlisted video: without it the player refuses to play. */
  hash?: string;
}

/** Keep in sync with validEmbed() in firestore.rules and src/lib/embed.ts. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const VIMEO_ID = /^[0-9]{1,12}$/;
export const VIMEO_HASH = /^[0-9a-f]{6,20}$/;

const MAX_INPUT = 500;

/**
 * The forms accepted, and nothing else:
 *
 *   youtube.com/watch?v={id}      (www., m. too)
 *   youtu.be/{id}
 *   youtube.com/shorts/{id}       (2026-09-23, Josh: Shorts are in)
 *   vimeo.com/{id}
 *   vimeo.com/{id}/{hash}         (unlisted)
 *
 * The scheme is optional, because members paste "youtu.be/…" as often as a
 * full URL. Trailing query parameters (`si=`, `t=`, `share=`) are ignored —
 * they are how the share buttons decorate a link, not part of the video.
 *
 * Refused on purpose: playlists without a `v=`, channels, `/live/`, `/embed/`
 * (an iframe src someone copied — the id is fine but the form invites pasting
 * whole embed codes), Vimeo showcases, channels and `player.vimeo.com`, and
 * Instagram Reels (Meta's oEmbed needs a reviewed app token; out of scope).
 */
export function parseEmbedUrl(input: unknown): EmbedRef | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > MAX_INPUT || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com") {
    if (segments.length === 1 && segments[0] === "watch") {
      const id = url.searchParams.get("v") ?? "";
      return YOUTUBE_ID.test(id) ? { provider: "youtube", videoId: id } : null;
    }
    if (segments.length === 2 && segments[0] === "shorts") {
      return YOUTUBE_ID.test(segments[1]) ? { provider: "youtube", videoId: segments[1] } : null;
    }
    return null;
  }
  if (host === "youtu.be") {
    return segments.length === 1 && YOUTUBE_ID.test(segments[0])
      ? { provider: "youtube", videoId: segments[0] }
      : null;
  }
  if (host === "vimeo.com") {
    if (segments.length === 1 && VIMEO_ID.test(segments[0])) {
      return { provider: "vimeo", videoId: segments[0] };
    }
    if (segments.length === 2 && VIMEO_ID.test(segments[0]) && VIMEO_HASH.test(segments[1])) {
      return { provider: "vimeo", videoId: segments[0], hash: segments[1] };
    }
    return null;
  }
  return null;
}

/** The public page of the video — what oEmbed is asked about, rebuilt from the id. */
export function canonicalVideoUrl(ref: EmbedRef): string {
  return ref.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${ref.videoId}`
    : `https://vimeo.com/${ref.videoId}${ref.hash ? `/${ref.hash}` : ""}`;
}

/** The provider's oEmbed endpoint for this video. Neither needs an API key. */
export function oembedEndpoint(ref: EmbedRef): string {
  const page = encodeURIComponent(canonicalVideoUrl(ref));
  return ref.provider === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${page}`
    : `https://vimeo.com/api/oembed.json?url=${page}`;
}

/**
 * The only hosts a thumbnail is ever downloaded from. oEmbed hands back a URL,
 * and fetching whatever URL a third party returns is how a server gets turned
 * into a proxy for someone else's requests.
 */
const THUMBNAIL_HOSTS = new Set(["i.ytimg.com", "i.vimeocdn.com"]);

export function isThumbnailUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && THUMBNAIL_HOSTS.has(url.hostname) && !url.port && !url.username;
  } catch {
    return false;
  }
}

export interface ThumbnailCandidate {
  url: string;
  /** Served inside a fixed 16:9 / 4:3 frame, so black bars may need cutting off. */
  letterboxed: boolean;
}

/**
 * The renditions to try, best first.
 *
 * YouTube: `oar2` is the thumbnail at the video's ORIGINAL aspect ratio
 * (1920×1080 for a film, 1080×1920 for a Short). It is undocumented, which is
 * why it is only the first try: `maxresdefault` (1280×720) and oEmbed's own
 * `hqdefault` (480×360) come after it, and those two are always framed —
 * a Short arrives as an upright picture in a wide frame, padded with black or
 * with a blurred copy of itself. Found 2026-09-23 while testing Shorts.
 *
 * Vimeo: the thumbnail URL ends in a size (`_640`, `_295x166`) that its CDN
 * re-renders on request, so asking for `_1920` gets the large one.
 */
export function thumbnailCandidates(ref: EmbedRef, oembedThumbnail: string | undefined): ThumbnailCandidate[] {
  const list: ThumbnailCandidate[] = [];
  if (ref.provider === "youtube") {
    list.push({ url: `https://i.ytimg.com/vi/${ref.videoId}/oar2.jpg`, letterboxed: false });
    list.push({ url: `https://i.ytimg.com/vi/${ref.videoId}/maxresdefault.jpg`, letterboxed: true });
  }
  if (ref.provider === "vimeo" && oembedThumbnail && isThumbnailUrl(oembedThumbnail)) {
    // The size is the end of the PATH; the URL itself goes on (`?region=us`).
    const url = new URL(oembedThumbnail);
    const path = url.pathname.replace(/_\d+(x\d+)?(?=(\.[a-z]+)?$)/, "_1920");
    if (path !== url.pathname) {
      url.pathname = path;
      list.push({ url: url.href, letterboxed: false });
    }
  }
  if (oembedThumbnail && isThumbnailUrl(oembedThumbnail)) {
    list.push({ url: oembedThumbnail, letterboxed: ref.provider === "youtube" });
  }
  return list.filter((c, i) => list.findIndex((o) => o.url === c.url) === i);
}
