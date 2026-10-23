// THE MEMBER PAGE'S WORK CAROUSELS (2026-10-23): the shared engine over
// MemberCarousel.astro's markup, plus the one thing the card does not have —
// the showing slide's caption under the dots. The engine writes the frame's
// `data-index`; this watches it and marks the matching `[data-slide-caption]`
// as `.is-on` (profile.css cross-fades the rest out). One observer per
// carousel, dropped with the page. The editor's preview (profilePreview.ts)
// can call initMemberCarousels() on its re-rendered works the same way.
import { initCarousels } from "./communityCarousel.ts";
import { pageLifetime, releaseWith } from "./pageLifecycle.ts";

const observers = new WeakMap<HTMLElement, MutationObserver>();

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
 *
 * The observers are released when the page is swapped out. A caller that
 * destroys its frames itself, through destroyMemberCarousels(), passes
 * `{ releaseOnLeave: false }`: the preview calls this on every keystroke, and
 * each call would otherwise add a before-swap listener and a release closure
 * that keeps the detached frames alive until the page leaves (2026-10-23
 * review). Its frames sit inside the page and go with it.
 */
export function initMemberCarousels(root: ParentNode = document, { releaseOnLeave = true } = {}): void {
  initCarousels(root);
  const figures = Array.from(root.querySelectorAll<HTMLElement>(".mprof__carousel"));
  if (!figures.length) return;
  const signal = releaseOnLeave ? pageLifetime() : null;
  for (const figure of figures) {
    const frame = figure.querySelector<HTMLElement>("[data-carousel]");
    if (!frame || frame.dataset.captionsFollow) continue;
    frame.dataset.captionsFollow = "true";
    showCaption(figure, frame.dataset.index);
    const observer = new MutationObserver(() => showCaption(figure, frame.dataset.index));
    observer.observe(frame, { attributes: true, attributeFilter: ["data-index"] });
    observers.set(frame, observer);
    if (signal) releaseWith(signal, () => stop(frame));
  }
}

function stop(frame: HTMLElement): void {
  observers.get(frame)?.disconnect();
  observers.delete(frame);
  delete frame.dataset.captionsFollow;
}

/**
 * Drops the caption observers under `root` ahead of the page's own release.
 * The editor's preview rebuilds its works on every change and calls this
 * before the old frames go, so no observer outlives its carousel.
 */
export function destroyMemberCarousels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach(stop);
}
