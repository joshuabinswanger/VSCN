// EACH PROJECT IS A CAROUSEL OF ITS WORKS (2026-09-26, Josh: "the projects
// should be shown as carousels on the profile page and in the preview").
// Until today this module paged between PROJECTS (2026-09-25, one slider for
// all of a member's projects); a project's own works still stacked inside
// each step, so a slide could be several screens tall. Now the projects stack
// down the page like everything else, and each one with two or more works
// pages through them one work per step. One level of swiping, never a swipe
// inside a swipe.
//
// The motion is the BROWSER'S, not a library's: the track is a plain
// horizontal scroll container with `scroll-snap-type: x mandatory` and one
// snap point per work (see .mprof__carousel-track in profile.css). That is
// what makes swipe, trackpad, a scrollbar-less mouse wheel and the arrow keys
// on the focused track all land on a whole work with no code at all. This
// module adds only what CSS cannot do:
//
//   1. THE BLEED. A work is as wide as the page's column; the track reaches
//      out to the edges of the scrollport so the next work spills into the
//      margin instead of being cut at the column's edge. How far that is
//      depends on where the column sits, which CSS cannot know without
//      `100vw` — and 100vw includes the .page-wrap scrollbar, which would
//      overshoot by its width and give the whole PAGE a horizontal scroll. So
//      the two distances are measured against .page-wrap's client box and
//      handed to the stylesheet as --bleed-l / --bleed-r. Unmeasured (no
//      script) they are 0 and the carousel is simply a column-wide scroller.
//   2. PREV / NEXT, the counter and the spoken position.
//   3. FOLLOWING THE LIGHTBOX (showInCarousel): paging the lightbox pages the
//      carousel behind it, so the close animation lands on a visible picture.
//
// Contract with the markup (MemberProject.astro on the page, the `carousel`
// template in ProfileViewPreview.astro in the editor): `[data-carousel]` on
// the wrapper, `[data-carousel-track]` holding one child per work,
// `[data-carousel-prev/next]`, `[data-carousel-count]`, `[data-carousel-live]`,
// and `data-position-label` ("Work {n} of {total}").

const live = new Map<HTMLElement, () => void>();

/** Releases every carousel's observers and listeners — the navigation sweep. */
export function destroyProjectCarousels(): void {
  live.forEach((release) => release());
  live.clear();
}

document.addEventListener("astro:before-swap", destroyProjectCarousels);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Per carousel: bring slide `i` to rest on the column, without animating. */
const seat = new WeakMap<HTMLElement, (slide: HTMLElement) => void>();

/**
 * Wires every un-wired carousel under `root`. Idempotent. Carousels that have
 * left the document are released first: the editor's preview replaces its
 * whole works list on every render, and each carousel holds a ResizeObserver
 * on .page-wrap that would otherwise outlive it.
 */
export function initProjectCarousels(root: ParentNode = document): void {
  live.forEach((release, el) => {
    if (el.isConnected) return;
    release();
    live.delete(el);
  });

  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
    if (live.has(carousel)) return;
    const track = carousel.querySelector<HTMLElement>("[data-carousel-track]");
    if (!track) return;
    const slides = Array.from(track.children) as HTMLElement[];
    const prev = carousel.querySelector<HTMLButtonElement>("[data-carousel-prev]");
    const next = carousel.querySelector<HTMLButtonElement>("[data-carousel-next]");
    const count = carousel.querySelector<HTMLElement>("[data-carousel-count]");
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";
    const controller = new AbortController();
    const { signal } = controller;

    let bleedLeft = 0;
    // The scrollport the page actually scrolls in (body is overflow:hidden,
    // see Layout.astro); the root element is the fallback for a page without
    // one. clientLeft/clientWidth, not the rect: they stop at the scrollbar.
    const bound = carousel.closest<HTMLElement>(".page-wrap") ?? document.documentElement;

    const measure = () => {
      const port = bound.getBoundingClientRect();
      const left = port.left + bound.clientLeft;
      const right = left + bound.clientWidth;
      const box = carousel.getBoundingClientRect();
      // Not laid out (a hidden tab): nothing to measure yet. The observer
      // below calls again once it has a size.
      if (!box.width) return;
      bleedLeft = Math.max(0, Math.floor(box.left - left));
      const bleedRight = Math.max(0, Math.floor(right - box.right));
      carousel.style.setProperty("--bleed-l", `${bleedLeft}px`);
      carousel.style.setProperty("--bleed-r", `${bleedRight}px`);
    };

    // A slide's resting scroll position: its left edge on the column's.
    // offsetLeft is measured from the track (position: relative in the CSS)
    // and includes the track's padding, which is the bleed.
    const restFor = (i: number) => slides[i].offsetLeft - bleedLeft;

    const current = () => {
      let best = 0;
      let distance = Infinity;
      slides.forEach((_, i) => {
        const d = Math.abs(restFor(i) - track.scrollLeft);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return best;
    };

    let shown = -1;
    let announce = false;
    const update = () => {
      const i = current();
      if (i === shown) return;
      shown = i;
      const atStart = i === 0;
      const atEnd = i === slides.length - 1;
      if (prev) prev.disabled = atStart;
      if (next) next.disabled = atEnd;
      if (count) count.textContent = `${i + 1} / ${slides.length}`;
      slides.forEach((slide, n) => slide.classList.toggle("is-current", n === i));
      // Spoken only when a control asked for the move — a swipe or a scroll is
      // already visible to whoever made it, and page load is not news.
      if (liveRegion && announce) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(slides.length));
      }
      announce = false;
    };

    const go = (i: number) => {
      const target = Math.max(0, Math.min(slides.length - 1, i));
      announce = true;
      track.scrollTo({ left: restFor(target), behavior: REDUCED.matches ? "auto" : "smooth" });
    };

    prev?.addEventListener("click", () => go(current() - 1), { signal });
    next?.addEventListener("click", () => go(current() + 1), { signal });
    track.addEventListener("scroll", update, { passive: true, signal });

    // Re-measured whenever the scrollport or the column changes size, and the
    // slide the visitor was on is put back on the column afterwards: a new
    // bleed moves every snap point, and without the re-seat a resize would
    // leave the track resting halfway between two works. This is also what
    // measures a carousel that was built while hidden (the editor's preview
    // tab): it has no box until the tab opens, and opening it is a resize.
    const observer = new ResizeObserver(() => {
      const i = shown < 0 ? 0 : shown;
      measure();
      track.scrollTo({ left: restFor(i), behavior: "auto" });
      shown = -1;
      update();
    });
    observer.observe(bound);
    observer.observe(carousel);

    seat.set(carousel, (slide) => {
      const i = slides.indexOf(slide);
      if (i < 0) return;
      track.scrollTo({ left: restFor(i), behavior: "auto" });
    });

    measure();
    update();

    live.set(carousel, () => {
      controller.abort();
      observer.disconnect();
      seat.delete(carousel);
    });
  });
}

/**
 * Puts the carousel slide holding `el` (a work's lightbox trigger) on the
 * column. Called from the lightbox's `change` event, so the carousel behind
 * it follows the lightbox and the zoom-out on close lands on the picture the
 * visitor was last looking at, not on whichever one the track was showing.
 * A no-op for a work that is not in a carousel.
 */
export function showInCarousel(el: Element | null | undefined): void {
  const carousel = el?.closest<HTMLElement>("[data-carousel]");
  const track = carousel?.querySelector<HTMLElement>("[data-carousel-track]");
  if (!carousel || !track) return;
  const slide = Array.from(track.children).find((child) => child.contains(el!));
  if (slide instanceof HTMLElement) seat.get(carousel)?.(slide);
}
