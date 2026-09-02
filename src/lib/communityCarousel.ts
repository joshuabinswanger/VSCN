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
// Everything below is a contract with the MARKUP, not with either component:
// `[data-carousel]` on the frame, `.ccard__track` inside it, `.ccard__slide`
// per work, `.ccard__img` per slide, `[data-carousel-prev/next]`,
// `[data-carousel-live]`, and `.ccard__dot` up on the card. Render that shape
// and it pages.
import EmblaCarousel from "embla-carousel";
import type { EmblaCarouselType } from "embla-carousel";

/**
 * Everything one carousel holds that has to be released. Embla is the worst of
 * the three: each instance owns a ResizeObserver, a MutationObserver, an
 * IntersectionObserver and non-passive drag listeners. Dropping the reference
 * removes none of them — only destroy() does.
 *
 * A MAP KEYED BY THE FRAME, not the three parallel Sets this used to be. The
 * Sets could only ever be swept whole, which was enough while carousels were
 * built once per page; the editor's preview REBUILDS its slides whenever the
 * member's gallery changes, and a rebuild has to release that one carousel
 * without touching any other. destroyAllCarousels() is still here for the
 * navigation sweep and now just walks the map.
 */
interface CarouselHandle {
  embla: EmblaCarouselType;
  io: IntersectionObserver | null;
  timer: ReturnType<typeof setInterval> | null;
}

const liveCarousels = new Map<HTMLElement, CarouselHandle>();

/**
 * Releases one carousel: its Embla instance, its auto-advance timer and its
 * visibility observer. Safe on a node that never had one.
 */
export function destroyCarousel(node: HTMLElement): void {
  // FIRST, AND UNCONDITIONALLY. initCarousels() sets this guard before it
  // decides whether the frame is worth an Embla instance at all — a gallery of
  // one gets the flag and no instance — so clearing it only when there is
  // something to release would leave the preview's frame permanently marked
  // ready after the member's FIRST image, and it would never page again once
  // they added a second.
  delete node.dataset.ready;
  const handle = liveCarousels.get(node);
  if (!handle) return;
  if (handle.timer !== null) clearInterval(handle.timer);
  handle.io?.disconnect();
  handle.embla.destroy();
  liveCarousels.delete(node);
}

/**
 * The navigation sweep. An interval or observer that survived a ClientRouter
 * navigation would keep firing against dead nodes forever.
 */
export function destroyAllCarousels(): void {
  [...liveCarousels.keys()].forEach(destroyCarousel);
}

// Registered by the module rather than by each consumer: the state above is
// this file's, so releasing it belongs here too, and a module is evaluated
// once per page bundle however many components import it.
document.addEventListener("astro:before-swap", destroyAllCarousels);

const MOBILE = window.matchMedia("(max-width: 767px)");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const AUTO_ADVANCE_MS = 5000;

/** Mobile gallery view only: the wall and the ledger hold still, desktop
 *  has the hover arrows. The default (server-rendered) state carries no
 *  data-pattern and IS the gallery — which is also what the editor's preview
 *  gets, since there is no #member-grid there at all. Deliberate: the preview
 *  shows what the member's card will do, and on a phone it advances. */
function autoAdvanceAllowed(): boolean {
  if (!MOBILE.matches || REDUCED.matches || document.hidden) return false;
  const grid = document.getElementById("member-grid");
  return !grid?.dataset.pattern || grid.dataset.pattern === "spread";
}

/**
 * Wires every un-wired `[data-carousel]` under `root`. Idempotent: a frame that
 * already has an instance is skipped, which is what makes it safe to call on
 * every astro:page-load and after every preview render.
 */
export function initCarousels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
    if (carousel.dataset.ready) return;
    carousel.dataset.ready = "true";
    const images = Array.from(carousel.querySelectorAll<HTMLImageElement>(".ccard__img"));

    // The build gives only the first image a src; the rest wait as data-src
    // so a page full of galleries doesn't decode every image of every member
    // at once (the iOS Safari crash). First contact with a carousel wakes its
    // whole gallery, so by the time a finger reaches the arrow the neighbours
    // are already loading. Embla never writes src itself — this stays the
    // only thing that does.
    //
    // The editor's preview writes a real src on every slide instead: it runs
    // in the browser with no build pipeline, and one member's gallery is eight
    // images at most. So there is nothing here for it to do, and nothing about
    // it to undo.
    const hydrate = (image: HTMLImageElement | undefined) => {
      if (!image?.dataset.src) return;
      image.src = image.dataset.src;
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      delete image.dataset.src;
      delete image.dataset.srcset;
    };
    const hydrateAll = () => images.forEach(hydrate);
    carousel.addEventListener("pointerenter", hydrateAll, { once: true });
    carousel.addEventListener("touchstart", hydrateAll, { once: true, passive: true });

    // One work: the track is there for the layout, but there is nothing to
    // page, nothing to announce, and no reason to pay for a drag handler.
    if (images.length < 2) return;

    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(".ccard__slide"));

    // ── THE LIGHTBOX TRIGGER FOLLOWS THE CAROUSEL ─────────
    // One link covers the frame, so it can only describe one image — and the
    // one it must describe is whichever the visitor is looking at. Each slide
    // carries its own data-work-* set (rendered in the frontmatter); this
    // copies the selected slide's onto the link, which is what PhotoSwipe
    // reads when the click lands. Without it, clicking slide 3 of a gallery
    // opened slide 1 — the server-rendered default — every time.
    //
    // Written as attributes rather than kept in a JS variable because the
    // lightbox is a SEPARATE script (CommunityGrid) that re-queries the DOM
    // at click time; the DOM is the only thing the two share.
    const frameLink = carousel.querySelector<HTMLAnchorElement>(".ccard__frame-link");
    const syncTrigger = (index: number) => {
      const slide = slides[index];
      if (!frameLink || !slide) return;
      const url = slide.dataset.workUrl;
      // Only where the link already goes somewhere. The preview's trigger is
      // deliberately href-less — there is no lightbox in the editor — and
      // writing one in would turn an inert element into something that looks
      // like a control and navigates out of an unsaved form.
      if (url && frameLink.hasAttribute("href")) frameLink.href = url;
      // Absent caption/description mean the attribute must GO, not be set to
      // "": PhotoSwipe's caption band tests the trimmed value, but a stale
      // attribute from the previous slide would survive a `?? ""` write.
      const copy = (from: string, to: string) => {
        const value = slide.dataset[from];
        if (value) frameLink.setAttribute(to, value);
        else frameLink.removeAttribute(to);
      };
      copy("workWidth", "data-pswp-width");
      copy("workHeight", "data-pswp-height");
      copy("workCaption", "data-pswp-caption");
      copy("workDescription", "data-pswp-description");
    };
    // The dots sit ABOVE the frame, so they are not descendants of the node
    // Embla was handed — they are queried from the card.
    const card = carousel.closest<HTMLElement>(".ccard") ?? carousel;
    const dots = Array.from(card.querySelectorAll<HTMLElement>(".ccard__dot"));
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";

    const embla = EmblaCarousel(carousel, {
      // Named rather than left to Embla's "first child" default: the frame
      // also holds the click target, the arrows and the dots, and which of
      // them happens to be first is a markup detail nothing should depend on.
      container: ".ccard__track",
      slides: ".ccard__slide",
      // The hand-rolled carousel wrapped with a modulo and the 5s
      // auto-advance relies on that to keep cycling; loop is the same
      // behaviour. Embla loops by translating the real slides, not by
      // cloning, so no image is ever duplicated into the DOM.
      loop: true,
      align: "start",
      // NOT the default 0. slidesInView is an IntersectionObserver, and at
      // threshold 0 the neighbouring slide counts as in view the instant its
      // rect touches the frame's — which, at a frame width of 439.94793701px,
      // it does by 0.00002px of floating-point noise. That silently hydrated
      // image 2 of every gallery on page load: sixteen extra decodes on the
      // directory, i.e. exactly the thing the data-src scheme exists to
      // prevent. 5% of the frame is far above the noise and still means "the
      // slide has visibly begun to appear".
      inViewThreshold: 0.05,
      // Skip the reInit when the element has no box. The index view sets
      // grid.hidden, which fires the ResizeObserver at width 0, and
      // re-measuring there would snap the carousel against zero-width
      // slides. Embla only rewrites its size cache on a real reInit, so the
      // entry that arrives when the grid comes back matches what was
      // measured at init and correctly asks for nothing.
      // The editor needs this just as badly, for a different reason: the
      // preview sits inside a `display: none` form section until the Preview
      // tab is opened.
      watchResize: (_api, entries) => entries.every((e) => e.contentRect.width > 0),
    });

    const handle: CarouselHandle = { embla, io: null, timer: null };
    liveCarousels.set(carousel, handle);

    // Reduced motion: arrive rather than travel. Embla's `jump` argument is
    // the exact counterpart of the crossfade dropping its transition under
    // the same query. Read per call, never cached — the OS setting can
    // change while the page is open.
    const jump = () => REDUCED.matches;

    // Embla's slidesInView is scoped to the FRAME (its observer root is the
    // container's parent), so this fires for a slide entering the carousel's
    // own viewport — the documented lazy-load hook, and the only wake-up
    // that covers auto-advance and the arrow keys on a card no pointer ever
    // entered.
    const hydrateInView = () => embla.slidesInView().forEach((i) => hydrate(images[i]));
    embla.on("slidesInView", hydrateInView);

    // The live region must not narrate the 5s auto-advance: a phone with
    // three cards on screen would otherwise talk over itself every few
    // seconds. The flag is lowered around the tick only, and `select` is
    // emitted synchronously from scrollNext, so it can never be read by the
    // wrong change.
    let announce = true;
    const sync = () => {
      const i = embla.selectedScrollSnap();
      syncTrigger(i);
      // The safety net the old show() carried: hydrate the target even if
      // neither the pointer nor the intersection observer got there first.
      // select fires as the scroll STARTS, so this is still in time.
      hydrate(images[i]);
      slides.forEach((slide, n) => {
        if (n === i) slide.removeAttribute("aria-hidden");
        else slide.setAttribute("aria-hidden", "true");
      });
      dots.forEach((dot, n) => dot.classList.toggle("ccard__dot--on", n === i));
      if (liveRegion && announce) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(slides.length));
      }
    };
    embla.on("select", sync);

    // The 5s auto-advance, mobile gallery only (arrows are display:none on
    // touch, so a multi-work gallery would otherwise be invisible past its
    // first image). Runs only while THIS card is on screen — an off-screen
    // carousel advancing would hydrate its whole gallery for nobody, and
    // decoded-image memory is what crashed iOS Safari. Conditions are
    // re-checked every tick, so switching views, rotating to desktop, or
    // backgrounding the tab pauses without bookkeeping. Deliberately NOT
    // Embla's Autoplay plugin: that plugin has no way to express "only in
    // the spread view, only on mobile, re-decided on every tick".
    const start = () => {
      if (handle.timer !== null) return;
      handle.timer = setInterval(() => {
        if (!autoAdvanceAllowed()) return;
        announce = false;
        embla.scrollNext();
        announce = true;
      }, AUTO_ADVANCE_MS);
    };
    const stop = () => {
      if (handle.timer === null) return;
      clearInterval(handle.timer);
      handle.timer = null;
    };
    const restart = () => {
      stop();
      start();
    };
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start();
      else stop();
    });
    io.observe(carousel);
    handle.io = io;

    // A fresh 5s from the image the visitor chose — without this the standing
    // timer can advance again moments after a drag.
    embla.on("pointerUp", restart);

    carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => {
      embla.scrollPrev(jump());
      restart();
    });
    carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => {
      embla.scrollNext(jump());
      restart();
    });

    // Keyboard. Bound to the FRAME, not to the arrows, because the arrows are
    // display:none under --bp-mobile and a keyboard user on a narrow viewport
    // could not reach works 2..n at all. The frame always contains exactly one
    // tab stop — .ccard__frame-link — so this needs no tabindex of its own and
    // adds no stops to a page already full of them. An arrow key on a link has
    // no default worth keeping here; this page never scrolls sideways.
    carousel.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      hydrateAll();
      if (e.key === "ArrowRight") embla.scrollNext(jump());
      else embla.scrollPrev(jump());
      restart();
    });

    // A drag must not navigate, and nothing here tracks a `swiped` flag any
    // more: Embla 8 owns that guard itself, with a capture-phase click
    // listener on the root that preventDefaults once the pointer has
    // travelled past dragThreshold. (clickAllowed() was the v7 API and is
    // gone from 8.x — the check moved inside the library.)
  });
}
