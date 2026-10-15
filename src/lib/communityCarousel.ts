// THE DIRECTORY CARD'S CAROUSEL — shared, on purpose.
//
// This was the <script> inside CommunityImageCard.astro. It moved out for the
// same reason the card's CSS did (see src/styles/communityCard.css): the
// profile editor's card preview renders the card's own anatomy now, and a
// carousel that only paged on /community would have left the preview showing
// the first image of a gallery and calling it a card (2026-09-02, Josh:
// "carousel shouls be the same elemnt in preview as well").
//
// Two consumers, one behaviour:
//   - CommunityImageCard.astro, which calls initCarousels() on page load
//   - renderCardPreview() in profilePreview.ts, which rebuilds the preview's
//     slides from live form state and re-inits just that one carousel
//
// NATIVE SCROLL-SNAP SINCE 2026-10-15 (the pages view, Josh: "carousel, but
// horizontal scroll-snap"). The track is a scroller the browser pages —
// swipe, trackpad, shift+wheel — and this module only READS where it landed
// (scrollLeft over the track's width) and moves it for the arrows, the
// chevrons, the keys and the lightbox. Embla went with it: a translated track
// needed a click overlay above it, and an overlay above a scroller eats the
// scroller's touch pan, so the slides are the click targets now.
//
// Everything below is a contract with the MARKUP, not with either component:
// `[data-carousel]` on the frame, `.ccard__track` inside it (the scroller),
// `a.ccard__slide` per work (the lightbox trigger, see CARD_TRIGGER in
// lightbox.ts), `.ccard__img` per slide, `[data-carousel-prev/next]`,
// `[data-carousel-live]`, and `.ccard__dots` on the card. Render that shape
// and it pages. The frame's `data-index` says which slide is showing.
import { ensurePagerChevron } from "./pager.ts";
import { hasKeyModifier } from "./keys.ts";

/**
 * Everything one carousel holds that has to be released: its listeners (all
 * bound with the handle's signal) and its ResizeObserver.
 *
 * A MAP KEYED BY THE FRAME, not a Set: the editor's preview REBUILDS its
 * slides whenever the member's gallery changes, and a rebuild has to release
 * that one carousel without touching any other. destroyAllCarousels() is the
 * navigation sweep and walks the map.
 */
interface CarouselHandle {
  listeners: AbortController;
  /** Re-reads the showing slide and re-reflects it. */
  sync?: () => void;
}

const liveCarousels = new Map<HTMLElement, CarouselHandle>();

/**
 * Releases one carousel: its listeners and its observer. Safe on a node that
 * never had either.
 */
export function destroyCarousel(node: HTMLElement): void {
  // FIRST, AND UNCONDITIONALLY. initCarousels() sets this guard before it
  // decides whether the frame has anything to page at all — a gallery of one
  // gets the flag and no engine — so clearing it only when there is something
  // to release would leave the preview's frame permanently marked ready after
  // the member's FIRST image, and it would never page again once they added a
  // second.
  delete node.dataset.ready;
  const handle = liveCarousels.get(node);
  if (!handle) return;
  handle.listeners.abort();
  liveCarousels.delete(node);
}

/** Re-reflects the showing slide (count, aria, tab stop) after the preview
 *  rewrote the slides' data. */
export function refreshCarousel(node: HTMLElement): void {
  liveCarousels.get(node)?.sync?.();
}

export function destroyAllCarousels(): void {
  [...liveCarousels.keys()].forEach(destroyCarousel);
}

document.addEventListener("astro:before-swap", destroyAllCarousels);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The slide the track is resting on (or nearest to). */
function indexOf(track: HTMLElement, total: number): number {
  const w = track.clientWidth || 1;
  return Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / w)));
}

export function initCarousels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
    if (carousel.dataset.ready) return;
    carousel.dataset.ready = "true";
    const handle: CarouselHandle = { listeners: new AbortController() };
    liveCarousels.set(carousel, handle);
    const { signal } = handle.listeners;

    // Only the first image carries a real src (see the card); the rest wait
    // as data-src until the visitor first touches or hovers THIS carousel,
    // or until the engine lands on them — before that, every member's whole
    // gallery decoded at once, which is what crash-looped iOS Safari.
    const images = Array.from(carousel.querySelectorAll<HTMLImageElement>(".ccard__img"));
    const hydrate = (image: HTMLImageElement | undefined) => {
      if (!image?.dataset.src) return;
      image.src = image.dataset.src;
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      delete image.dataset.src;
      delete image.dataset.srcset;
    };
    const hydrateAll = () => images.forEach(hydrate);
    carousel.addEventListener("pointerenter", hydrateAll, { once: true, signal });
    carousel.addEventListener("touchstart", hydrateAll, { once: true, passive: true, signal });

    // A gallery of one still gets the track markup — same box, same CSS —
    // but nothing to page: no controls, no live region, no tab-stop dance.
    const track = carousel.querySelector<HTMLElement>(".ccard__track");
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(".ccard__slide"));
    if (!track || slides.length < 2) return;
    const total = slides.length;

    const card = carousel.closest<HTMLElement>(".ccard") ?? carousel;
    const dots = Array.from(card.querySelectorAll<HTMLElement>(".ccard__dot"));
    const dotRow = card.querySelector<HTMLElement>(".ccard__dots");
    let count = dotRow?.querySelector<HTMLElement>(".ccard__count") ?? null;
    if (dotRow && !count) {
      count = document.createElement("span");
      count.className = "ccard__count";
      count.textContent = `1 / ${total}`;
      dotRow.prepend(count);
    }
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";

    // WHAT A SLIDE CHANGE MEANS: the showing slide is the one tab stop and
    // the one a screen reader may reach (the others are aria-hidden — opacity
    // and overflow hide nothing from it), its neighbours are fetched so the
    // next swipe lands on a picture, the count and the dots follow, and the
    // live region says "Image 2 of 3" — unless the lightbox asked for the
    // move, which is already announcing the picture it opened.
    let current = -1;
    let quiet = false;
    const reflect = (i: number) => {
      if (i === current) return;
      current = i;
      carousel.dataset.index = String(i);
      hydrate(images[i]);
      hydrate(images[i + 1]);
      hydrate(images[i - 1]);
      slides.forEach((slide, n) => {
        if (n === i) slide.removeAttribute("aria-hidden");
        else slide.setAttribute("aria-hidden", "true");
        slide.tabIndex = n === i ? 0 : -1;
      });
      dots.forEach((dot, n) => dot.classList.toggle("ccard__dot--on", n === i));
      if (count) count.textContent = `${i + 1} / ${total}`;
      if (liveRegion && !quiet) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(total));
      }
    };
    reflect(indexOf(track, total));
    handle.sync = () => {
      current = -1;
      reflect(indexOf(track, total));
    };

    // The ends WRAP, as Embla's loop did: ‹ on the first slide shows the last.
    // A wrap is a jump — sliding the whole track past every picture in
    // between would be a film strip, not a page turn.
    const goTo = (i: number, jump = false) => {
      const target = ((i % total) + total) % total;
      const wraps = Math.abs(target - current) > 1;
      track.scrollTo({
        left: target * track.clientWidth,
        behavior: jump || wraps || REDUCED.matches ? "instant" : "smooth",
      });
      reflect(target);
    };
    const next = () => goTo(current + 1);
    const prev = () => goTo(current - 1);

    // A swipe or a trackpad gesture moves the track without us: read it back
    // once a frame. (Not `scrollend` — Safari delivered it late or not at all
    // on an inner scroller, and this needs no end, only the position.)
    let ticking = false;
    track.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          reflect(indexOf(track, total));
        });
      },
      { passive: true, signal },
    );

    // A resize moves every snap point; put the track back on its slide.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (current >= 0) {
          track.scrollTo({ left: current * track.clientWidth, behavior: "instant" });
        }
      });
      ro.observe(track);
      signal.addEventListener("abort", () => ro.disconnect());
    }

    // The lightbox paging THIS card's pictures full screen tells the slide
    // it is on (lightbox.ts, bindCardOpener); the frame follows, quietly.
    carousel.addEventListener(
      "vscn:carousel-show",
      (e) => {
        const i = slides.indexOf(e.target as HTMLElement);
        if (i >= 0 && i !== current) {
          quiet = true;
          goTo(i, true);
          quiet = false;
        }
      },
      { signal },
    );

    const prevArrow = carousel.querySelector<HTMLElement>("[data-carousel-prev]");
    const nextArrow = carousel.querySelector<HTMLElement>("[data-carousel-next]");
    prevArrow?.addEventListener("click", prev, { signal });
    nextArrow?.addEventListener("click", next, { signal });

    // THE ARROWS REST AFTER A CLICK (2026-09-03): a mouse press on an edge
    // arrow hides both until the pointer comes back in or focus arrives
    // visibly, so the arrow does not sit over the picture it just turned to.
    // A keyboard activation (detail 0) never rests them.
    const rest = (e: MouseEvent) => {
      if (e.detail === 0) return;
      carousel.classList.toggle("is-arrows-resting", true);
    };
    const wake = () => carousel.classList.toggle("is-arrows-resting", false);
    prevArrow?.addEventListener("click", rest, { signal });
    nextArrow?.addEventListener("click", rest, { signal });
    carousel.addEventListener("pointerenter", wake, { signal });
    carousel.addEventListener(
      "focusin",
      (e) => {
        if (e.target instanceof Element && e.target.matches(":focus-visible")) wake();
      },
      { signal },
    );

    // The card's count row: "‹ 2 / 7 ›". The chevrons are the same control
    // as the edge arrows, drawn where the count is (pager.ts).
    if (dotRow) {
      const prevPager = ensurePagerChevron(dotRow, "prev", prev, {
        label: prevArrow?.getAttribute("aria-label"),
        signal,
      });
      const nextPager = ensurePagerChevron(dotRow, "next", next, {
        label: nextArrow?.getAttribute("aria-label"),
        signal,
      });
      prevPager.addEventListener("click", rest, { signal });
      nextPager.addEventListener("click", rest, { signal });
    }

    // Arrow keys page while anything in the frame has focus — the showing
    // slide is the tab stop, and focus moves with the page so a second press
    // keeps working from the new slide.
    carousel.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if (hasKeyModifier(e)) return;
        e.preventDefault();
        wake();
        hydrateAll();
        if (e.key === "ArrowRight") next();
        else prev();
        slides[current]?.focus({ preventScroll: true });
      },
      { signal },
    );
  });
}
