// THE SITE'S ONE LIGHTBOX — the PhotoSwipe options and the gallery card's
// whole-carousel opener, shared by every page that opens a picture.
//
// Until 2026-09-24 the member page and the community grid each carried a
// verbatim copy of the options below, and the profile editor's Preview tab
// carried none: its image links were href-less and nothing bound PhotoSwipe
// there, so pressing a picture in the preview did nothing at all. A third copy
// was the alternative to this module; it is the same reasoning that moved the
// words into lightboxText.ts on 2026-09-04 — there is ONE lightbox on this
// site and it must not look or speak differently depending on which gallery
// opened it.
//
// The CSS half stays with each caller (`photoswipe/style.css`, then
// `styles/lightbox.css`), because the order of those two imports is part of
// the contract and it is stated where the page's bundle is assembled.
import PhotoSwipeLightbox from "photoswipe/lightbox";
import type { SlideData } from "photoswipe";
import { lightboxPadding, registerLightboxText } from "./lightboxText.ts";
import { registerLightboxEmbeds } from "./lightboxEmbed.ts";

export interface LightboxStrings {
  close: string;
  zoom: string;
  prev: string;
  next: string;
  error: string;
  /** Accessible name for the per-image "where this appeared" link. */
  linkTitle: string;
  /** Accessible name for the member's own-site link on a piece. */
  siteLinkTitle: string;
  /** "Play video on {provider}" — the video slide's button. */
  play: string;
  /** "Part of", before a project's title. */
  partOf: string;
  /** "With", before a project's affiliations. */
  with: string;
}

// English is the fallback, matching useTranslations() — a missing or
// malformed attribute costs the translation, never the lightbox.
export const LIGHTBOX_FALLBACK: LightboxStrings = {
  close: "Close",
  zoom: "Zoom",
  prev: "Previous image",
  next: "Next image",
  error: "The image cannot be loaded",
  linkTitle: "Where this image appeared",
  siteLinkTitle: "This piece on the maker's own site",
  play: "Play video on {provider}",
  partOf: "Part of",
  with: "With",
};

/** The translation key behind each string — what the built pages pass to t() and the editor reads off `ui`. */
export const LIGHTBOX_STRING_KEYS: Record<keyof LightboxStrings, string> = {
  close: "member.lightbox.close",
  zoom: "member.lightbox.zoom",
  prev: "member.lightbox.prev",
  next: "member.lightbox.next",
  error: "member.lightbox.error",
  linkTitle: "member.lightbox.link",
  siteLinkTitle: "member.lightbox.siteLink",
  play: "member.lightbox.play",
  partOf: "member.project.partOf",
  with: "member.project.with",
};

/** The strings from a client-side translation table; a missing key keeps the English fallback. */
export function lightboxStringsFrom(table: Record<string, string | undefined>): LightboxStrings {
  const out = { ...LIGHTBOX_FALLBACK };
  for (const [field, key] of Object.entries(LIGHTBOX_STRING_KEYS) as [keyof LightboxStrings, string][]) {
    const value = table[key];
    if (value) out[field] = value;
  }
  return out;
}

/** The `data-pswp-i18n` attribute's JSON over the fallback; malformed JSON keeps the fallback. */
export function parseLightboxStrings(json: string | undefined): LightboxStrings {
  try {
    return { ...LIGHTBOX_FALLBACK, ...JSON.parse(json || "{}") };
  } catch {
    return LIGHTBOX_FALLBACK;
  }
}

// These options take raw HTML, which is how the stock SVG icons get replaced
// with markup this site can style. Everything injected here is either a
// static string or an escaped translation.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Two borders on a box turned 45deg — the drawing .ccard__arrow uses on the
// community card, reproduced so every pager on the site is one control.
const CHEVRON = '<span class="pswp__vscn-chevron" aria-hidden="true"></span>';

/**
 * A lightbox with the site's chrome, words and video slides registered — not
 * yet `init()`ed, so a caller can add its own handlers first.
 *
 * `target` is the DOM gallery PhotoSwipe binds its own click to. Leave it out
 * when every item is opened by hand (bindCardOpener alone): a gallery WITHOUT
 * a children selector opens on any click inside it, arrows included.
 */
export function createLightbox(
  strings: LightboxStrings,
  target?: { gallery: string | HTMLElement; children: string },
): PhotoSwipeLightbox {
  // The site drops transitions and leaves the thing in its final state
  // rather than substituting a gentler animation. PhotoSwipe drives its
  // open, close and zoom from JS, so they have to be switched off here; the
  // CSS half lives in lightbox.css.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const lightbox = new PhotoSwipeLightbox({
    ...(target ? { gallery: target.gallery, children: target.children } : {}),
    pswpModule: () => import("photoswipe"),

    // ── Chrome. Nothing below changes behaviour. ──
    // The hook every rule in lightbox.css hangs off.
    mainClass: "pswp--vscn",
    // Solid: the ground is the page's own paper, not a veil over it. Drag to
    // dismiss still fades it, which is what makes the gesture legible.
    bgOpacity: 1,
    // PER SLIDE — see lightboxPadding in lightboxText.ts, which is also where
    // the reasoning lives. The words go under the picture on every shape
    // (2026-09-06); an upright image only reserves more room below, because
    // it comes out narrower.
    paddingFn: lightboxPadding,
    closeSVG: `<span class="pswp__vscn-word">${esc(strings.close)}</span>`,
    arrowPrevSVG: CHEVRON,
    arrowNextSVG: CHEVRON,
    zoomSVG: '<span class="pswp__vscn-zoom" aria-hidden="true"></span>',
    // The glyphs above are all aria-hidden, so these are what a screen
    // reader gets; PhotoSwipe writes each to both `title` and `aria-label`.
    closeTitle: strings.close,
    zoomTitle: strings.zoom,
    arrowPrevTitle: strings.prev,
    arrowNextTitle: strings.next,
    errorMsg: strings.error,

    // Spread rather than a ternary per key: PhotoSwipe merges options over
    // its defaults, so writing `undefined` into one of these would erase the
    // default instead of keeping it.
    ...(reduced
      ? {
          showHideAnimationType: "none" as const,
          showAnimationDuration: 0,
          hideAnimationDuration: 0,
          zoomAnimationDuration: false as const,
        }
      : {}),
  });

  // The artist line, the caption, the description and the links.
  registerLightboxText(lightbox, {
    linkTitle: strings.linkTitle,
    siteLinkTitle: strings.siteLinkTitle,
    partOf: strings.partOf,
    with: strings.with,
  });
  // A video work opens as its poster with a play button; see lightboxEmbed.ts.
  registerLightboxEmbeds(lightbox, { play: strings.play });

  return lightbox;
}

/** The gallery card's click target: one bare link laid over its carousel. */
export const CARD_TRIGGER = ".ccard__frame-link";

/**
 * THE GALLERY CARD OPENS AS A WHOLE (2026-09-08). Returns the unbind.
 *
 * Bound in the CAPTURE phase on `container`, so it runs before PhotoSwipe's
 * own click listener on the same element and can stop the event reaching
 * it; the link's default, opening the original in a new tab, is prevented
 * here and only here.
 *
 * The items are the frame's .ccard__slide elements, read into SlideData by
 * hand rather than handed over as elements: PhotoSwipe's own DOM parser only
 * reads a slide that contains an <a>, and these deliberately do not (the one
 * link is a sibling of the track — see the card). Each slide carries the full
 * data-pswp-* set, and `element` is the slide itself, which is what makes the
 * two shared renderers just work: lightboxText reads the text off
 * `data.element.dataset`, and PhotoSwipe finds the thumbnail to grow out of
 * with `element.querySelector("img")` — the slide's own picture, cropped to
 * the frame (hence thumbCropped).
 *
 * The starting slide is the one whose work URL the carousel copied onto the
 * link's href (communityCarousel's syncTrigger). Matching on the URL rather
 * than on an index keeps this module ignorant of Embla. The editor's preview
 * card has an href-less link (it must never navigate out of an unsaved form),
 * so there the start falls back to the slide the carousel is NOT hiding —
 * syncTrigger's sibling marks every other slide aria-hidden.
 *
 * Same escape hatches as PhotoSwipe's own handler: a modified click
 * (ctrl/cmd/shift/alt, middle button) keeps its browser meaning, and a click
 * while a lightbox is already open does nothing.
 */
export function bindCardOpener(container: HTMLElement, lightbox: PhotoSwipeLightbox): () => void {
  const openCard = (e: MouseEvent) => {
    const trigger = (e.target as Element | null)?.closest<HTMLAnchorElement>(CARD_TRIGGER);
    if (!trigger || !container.contains(trigger)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button === 1) return;
    if (lightbox.pswp) return;

    const frame = trigger.parentElement;
    const slides = Array.from(frame?.querySelectorAll<HTMLElement>(".ccard__slide") ?? []);
    if (!slides.length) return;

    e.preventDefault();
    e.stopPropagation();

    const href = trigger.getAttribute("href");
    const byUrl = href ? slides.findIndex((s) => s.dataset.workUrl === href) : -1;
    const start = Math.max(
      0,
      byUrl >= 0 ? byUrl : slides.findIndex((s) => s.getAttribute("aria-hidden") !== "true"),
    );

    const items: SlideData[] = slides.map((slide) => {
      const img = slide.querySelector<HTMLImageElement>(".ccard__img");
      // A lazy slide's <img> has no src yet (data-src, see the card): no
      // placeholder then, rather than a broken one.
      const msrc = img?.currentSrc || img?.src || undefined;
      return {
        src: slide.dataset.workUrl,
        width: Number(slide.dataset.pswpWidth) || 0,
        height: Number(slide.dataset.pswpHeight) || 0,
        msrc,
        alt: img?.alt ?? "",
        thumbCropped: true,
        element: slide,
      };
    });

    // Keyboard "clicks" arrive with no coordinates; PhotoSwipe reads a null
    // point as "no zoom origin" and falls back to the thumbnail's bounds.
    const point = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null;
    lightbox.loadAndOpen(start, items, point);
  };
  container.addEventListener("click", openCard, true);

  // THE CARD FOLLOWS. Every time the lightbox lands on one of a card's
  // slides — opening included — the carousel underneath is told, and turns to
  // the same picture (communityCarousel listens for this on the carousel).
  // Closing then zooms out onto the image the visitor was looking at, not onto
  // the one they opened; and the card is left showing where they got to.
  lightbox.on("change", () => {
    const el = lightbox.pswp?.currSlide?.data.element;
    if (el?.classList.contains("ccard__slide")) {
      el.dispatchEvent(new CustomEvent("vscn:carousel-show", { bubbles: true }));
    }
  });

  return () => container.removeEventListener("click", openCard, true);
}
