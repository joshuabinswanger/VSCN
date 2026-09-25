// THE MEMBER PAGE'S PROJECTS SLIDER (2026-09-25, Josh: "show Projects as a
// horizontal slider that moves in steps").
//
// The motion is the BROWSER'S, not a library's: the track is a plain
// horizontal scroll container with `scroll-snap-type: x mandatory` and one
// snap point per project (see .mprof__projects-track in profile.css). That is
// what makes swipe, trackpad, a scrollbar-less mouse wheel and the arrow keys
// on the focused track all land on a whole project with no code at all. This
// module adds only what CSS cannot do:
//
//   1. THE BLEED. A project is as wide as the page's column; the track reaches
//      out to the edges of the scrollport so later projects spill into the
//      margin instead of being cut at the column's edge. How far that is
//      depends on where the column sits, which CSS cannot know without
//      `100vw` — and 100vw includes the .page-wrap scrollbar, which would
//      overshoot by its width and give the whole PAGE a horizontal scroll. So
//      the two distances are measured against .page-wrap's client box and
//      handed to the stylesheet as --bleed-l / --bleed-r. Unmeasured (no
//      script) they are 0 and the slider is simply a column-wide scroller.
//   2. PREV / NEXT, the counter and the spoken position.
//
// Contract with the markup in members/[slug].astro: `[data-project-slider]`
// on the wrapper, `[data-project-track]` holding one child per project,
// `[data-project-prev/next]`, `[data-project-count]`, `[data-project-live]`,
// and `data-position-label` ("Project {n} of {total}").

const live = new Map<HTMLElement, () => void>();

/** Releases every slider's observers and listeners — the navigation sweep. */
export function destroyProjectSliders(): void {
  live.forEach((release) => release());
  live.clear();
}

document.addEventListener("astro:before-swap", destroyProjectSliders);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Wires every un-wired slider under `root`. Idempotent. */
export function initProjectSliders(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-project-slider]").forEach((slider) => {
    if (live.has(slider)) return;
    const track = slider.querySelector<HTMLElement>("[data-project-track]");
    if (!track) return;
    const slides = Array.from(track.children) as HTMLElement[];
    const prev = slider.querySelector<HTMLButtonElement>("[data-project-prev]");
    const next = slider.querySelector<HTMLButtonElement>("[data-project-next]");
    const count = slider.querySelector<HTMLElement>("[data-project-count]");
    const liveRegion = slider.querySelector<HTMLElement>("[data-project-live]");
    const positionLabel = slider.dataset.positionLabel ?? "";
    const controller = new AbortController();
    const { signal } = controller;

    let bleedLeft = 0;
    // The scrollport the page actually scrolls in (body is overflow:hidden,
    // see Layout.astro); the root element is the fallback for a page without
    // one. clientLeft/clientWidth, not the rect: they stop at the scrollbar.
    const bound = slider.closest<HTMLElement>(".page-wrap") ?? document.documentElement;

    const measure = () => {
      const port = bound.getBoundingClientRect();
      const left = port.left + bound.clientLeft;
      const right = left + bound.clientWidth;
      const box = slider.getBoundingClientRect();
      bleedLeft = Math.max(0, Math.floor(box.left - left));
      const bleedRight = Math.max(0, Math.floor(right - box.right));
      slider.style.setProperty("--bleed-l", `${bleedLeft}px`);
      slider.style.setProperty("--bleed-r", `${bleedRight}px`);
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
    // leave the track resting halfway between two projects.
    const observer = new ResizeObserver(() => {
      const i = shown < 0 ? 0 : shown;
      measure();
      track.scrollTo({ left: restFor(i), behavior: "auto" });
      shown = -1;
      update();
    });
    observer.observe(bound);
    observer.observe(slider);

    measure();
    update();

    live.set(slider, () => {
      controller.abort();
      observer.disconnect();
    });
  });
}
