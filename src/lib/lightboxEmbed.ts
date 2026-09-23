/**
 * THE VIDEO SLIDE (2026-09-23, release 1 of
 * documentation/20260923-motion-works-design.md).
 *
 * One module for every lightbox on the site, the same way lightboxText.ts is:
 * the wall, the gallery card and the member page must not play a video three
 * different ways.
 *
 * A work whose trigger carries `data-pswp-embed` (embedDataAttrs in embed.ts)
 * opens as a custom `embed` slide: its poster — our own copy, from Storage —
 * with a play button over it. NOTHING IS LOADED FROM YOUTUBE OR VIMEO UNTIL
 * THAT BUTTON IS PRESSED; that is the privacy promise the privacy page makes.
 * Pressing it swaps the poster for the platform's player; leaving the slide
 * (paging on, or closing) destroys the iframe, so no player keeps running,
 * or keeps a connection open, behind a slide nobody is looking at.
 *
 * The iframe src is rebuilt from the stored id (embedPlayerUrl), never read
 * from the page's markup as a URL.
 */
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { SlideData } from "photoswipe";
import { embedFromDataset, embedPlayerUrl, providerName, type EmbedRef } from "./embed.ts";

export interface LightboxEmbedStrings {
  /** "Play video on {provider}" — the button's accessible name. */
  play: string;
}

type EmbedSlideData = SlideData & { embed?: EmbedRef };

function startPlayer(box: HTMLElement, embed: EmbedRef, title: string) {
  if (box.querySelector("iframe")) return;
  const iframe = document.createElement("iframe");
  iframe.className = "pswp__vscn-embed-frame";
  iframe.src = embedPlayerUrl(embed);
  iframe.title = title;
  iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
  iframe.allowFullscreen = true;
  // The ORIGIN goes, the path does not. YouTube refuses to play an embed that
  // arrives with no referrer at all (its "error 153"), so `no-referrer` would
  // break every video; the member page's path is nobody's business.
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  box.classList.add("is-playing");
  box.appendChild(iframe);
  iframe.focus();
}

function stopPlayer(box: HTMLElement | null | undefined) {
  if (!box) return;
  box.querySelector("iframe")?.remove();
  box.classList.remove("is-playing");
}

export function registerLightboxEmbeds(lightbox: PhotoSwipeLightbox, strings: LightboxEmbedStrings): void {
  // Both ways a slide is made pass through here: PhotoSwipe's own DOM parser
  // (the wall and the member page, element = the trigger link) and the
  // gallery card's hand-built items (element = the slide).
  lightbox.addFilter("itemData", (itemData: EmbedSlideData) => {
    const embed = embedFromDataset((itemData.element as HTMLElement | undefined)?.dataset);
    if (embed) {
      itemData.type = "embed";
      itemData.embed = embed;
    }
    return itemData;
  });

  lightbox.on("contentLoad", (event) => {
    const { content } = event;
    const embed = (content.data as EmbedSlideData).embed;
    if (content.type !== "embed" || !embed) return;
    event.preventDefault();

    const box = document.createElement("div");
    box.className = "pswp__vscn-embed";

    const poster = document.createElement("img");
    poster.className = "pswp__vscn-embed-poster";
    poster.src = content.data.src ?? "";
    poster.alt = content.data.alt ?? "";
    poster.decoding = "async";
    poster.draggable = false;

    const name = strings.play.replace("{provider}", providerName(embed.provider));
    const play = document.createElement("button");
    play.type = "button";
    play.className = "pswp__vscn-embed-play";
    play.setAttribute("aria-label", name);
    play.title = name;
    play.innerHTML = '<span class="vscn-play" aria-hidden="true"></span>';
    play.addEventListener("click", (e) => {
      // Not a tap on the slide: PhotoSwipe would read it as "toggle the UI".
      e.stopPropagation();
      startPlayer(box, embed, content.data.alt || name);
    });

    box.append(poster, play);
    content.element = box;
  });

  // Paging away from the slide, or closing the lightbox, ends the player.
  lightbox.on("contentDeactivate", ({ content }) => {
    if (content.type === "embed") stopPlayer(content.element as HTMLElement | undefined);
  });
  lightbox.on("contentRemove", ({ content }) => {
    if (content.type === "embed") stopPlayer(content.element as HTMLElement | undefined);
  });
  lightbox.on("close", () => {
    for (const box of document.querySelectorAll<HTMLElement>(".pswp__vscn-embed.is-playing")) stopPlayer(box);
  });

  // A press on play is not also a tap on the slide. PhotoSwipe detects TOUCH taps
  // itself on pointerup — the click handler's stopPropagation never reaches
  // it — and would otherwise toggle the controls away as the video starts.
  const onPlay = (event: Event | undefined) =>
    Boolean((event?.target as Element | null)?.closest?.(".pswp__vscn-embed-play"));
  lightbox.on("tapAction", (e) => { if (onPlay(e.originalEvent)) e.preventDefault(); });
}
