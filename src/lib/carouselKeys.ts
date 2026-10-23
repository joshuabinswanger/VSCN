// ← → PAGE THE CAROUSEL ON SCREEN (2026-10-23, work carousels inside a
// project, documentation/20261023-work-carousels-design.md "Member page").
//
// A carousel's own keys only work while something inside its frame has
// focus (communityCarousel.ts). On the member page a visitor reads down a
// column of works and never focuses a picture, so ← → with nothing focused
// find the carousel nearest the middle of the viewport and ask it to step —
// the same ask the Portfolios pages make for the showing card
// (pagesPager.ts, vscn:carousel-step).
//
// The viewport is the scroller's box: .page-wrap on a desktop, where it is
// the scroll container (Layout.astro), and the window on a phone, where the
// document scrolls (global.css). Bound per page visit on astro:page-load and
// released on before-swap (pageLifetime), only when the page has a carousel.
import { pageLifetime } from "./pageLifecycle.ts";
import { hasKeyModifier } from "./keys.ts";

/**
 * Which rect is nearest the middle of the viewport (`top`..`bottom`): one
 * over the middle wins outright; otherwise the visible rect whose nearest
 * edge is closest to it. A tie goes to the earlier one. −1 when no rect is
 * in the viewport at all.
 */
export function nearestToMiddle(
  rects: readonly { top: number; bottom: number }[],
  viewportTop: number,
  viewportBottom: number,
): number {
  const middle = (viewportTop + viewportBottom) / 2;
  let best = -1;
  let bestDistance = Infinity;
  rects.forEach((rect, i) => {
    if (rect.bottom <= viewportTop || rect.top >= viewportBottom) return;
    const distance = rect.top <= middle && rect.bottom >= middle ? 0 : Math.min(Math.abs(rect.top - middle), Math.abs(rect.bottom - middle));
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** The viewport the carousels are measured against, in client coordinates. */
function viewportOf(): { top: number; bottom: number } {
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (wrap && getComputedStyle(wrap).overflowY !== "visible") {
    const box = wrap.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  }
  return { top: 0, bottom: window.innerHeight };
}

/**
 * Binds ← → for the carousels under `root` for this page visit. Nothing is
 * bound when there are none. Call from astro:page-load.
 */
export function initCarouselKeys(root: ParentNode = document): void {
  const frames = Array.from(root.querySelectorAll<HTMLElement>("[data-carousel]"));
  if (!frames.length) return;
  const signal = pageLifetime();
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (hasKeyModifier(e) || typing(e.target)) return;
      // Inside a frame the carousel's own handler has them; in the lightbox
      // PhotoSwipe does.
      if (e.target instanceof Element && e.target.closest("[data-carousel]")) return;
      if (document.querySelector(".pswp--open")) return;
      const { top, bottom } = viewportOf();
      const live = frames.filter((frame) => frame.isConnected);
      const i = nearestToMiddle(
        live.map((frame) => frame.getBoundingClientRect()),
        top,
        bottom,
      );
      if (i < 0) return;
      e.preventDefault();
      live[i].dispatchEvent(new CustomEvent("vscn:carousel-step", { detail: e.key === "ArrowRight" ? 1 : -1 }));
    },
    { signal },
  );
}
