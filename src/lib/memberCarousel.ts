// THE MEMBER PAGE'S WORK CAROUSELS (2026-10-23): the shared engine over
// MemberCarousel.astro's markup, plus the one thing the card does not have —
// the showing slide's caption under the dots. The engine writes the frame's
// `data-index`; this watches it and marks the matching `[data-slide-caption]`
// as `.is-on` (profile.css cross-fades the rest out). One observer per
// carousel, dropped with the page. The editor's preview (profilePreview.ts)
// can call initMemberCarousels() on its re-rendered works the same way.
import { initCarousels } from "./communityCarousel.ts";
import { pageLifetime, releaseWith } from "./pageLifecycle.ts";

/** Marks caption `i` of a carousel figure as the showing one. */
function showCaption(figure: HTMLElement, i: string | undefined): void {
  figure.querySelectorAll<HTMLElement>("[data-slide-caption]").forEach((caption) => {
    caption.classList.toggle("is-on", caption.dataset.slideCaption === (i ?? "0"));
  });
}

/**
 * Starts every carousel under `root` and keeps each one's captions in step
 * with its frame. Safe to call again: a frame already running is skipped by
 * the engine, and its observer is only added once.
 */
export function initMemberCarousels(root: ParentNode = document): void {
  initCarousels(root);
  const figures = Array.from(root.querySelectorAll<HTMLElement>(".mprof__carousel"));
  if (!figures.length) return;
  const signal = pageLifetime();
  for (const figure of figures) {
    const frame = figure.querySelector<HTMLElement>("[data-carousel]");
    if (!frame || frame.dataset.captionsFollow) continue;
    frame.dataset.captionsFollow = "true";
    showCaption(figure, frame.dataset.index);
    const observer = new MutationObserver(() => showCaption(figure, frame.dataset.index));
    observer.observe(frame, { attributes: true, attributeFilter: ["data-index"] });
    releaseWith(signal, () => {
      observer.disconnect();
      delete frame.dataset.captionsFollow;
    });
  }
}
