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
import { ensurePagerChevron } from "./pager.ts";

/**
 * Everything one carousel holds that has to be released. Each Embla instance
 * owns a ResizeObserver, a MutationObserver, an IntersectionObserver and
 * non-passive drag listeners. Dropping the reference removes none of them —
 * only destroy() does.
 *
 * A MAP KEYED BY THE FRAME, not the parallel Sets this used to be. The Sets
 * could only ever be swept whole, which was enough while carousels were built
 * once per page; the editor's preview REBUILDS its slides whenever the
 * member's gallery changes, and a rebuild has to release that one carousel
 * without touching any other. destroyAllCarousels() is still here for the
 * navigation sweep and now just walks the map.
 *
 * NO TIMER ANY MORE (2026-09-28, Josh: autoplay and its ▶/Ⅱ button removed).
 * The card used to advance itself every 5 s on a phone, for the one card
 * nearest the middle of the scrollport; a card now moves only when somebody
 * moves it — swipe, arrows, chevrons, keys or the lightbox.
 */
interface CarouselHandle {
  embla: EmblaCarouselType;
}

const liveCarousels = new Map<HTMLElement, CarouselHandle>();

/**
 * Releases one carousel's Embla instance. Safe on a node that never had one.
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
  handle.embla.destroy();
  liveCarousels.delete(node);
}

/**
 * The navigation sweep. An observer that survived a ClientRouter navigation
 * would keep firing against dead nodes forever.
 */
export function destroyAllCarousels(): void {
  [...liveCarousels.keys()].forEach(destroyCarousel);
}

// Registered by the module rather than by each consumer: the state above is
// this file's, so releasing it belongs here too, and a module is evaluated
// once per page bundle however many components import it.
document.addEventListener("astro:before-swap", destroyAllCarousels);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    // carries its own data-pswp-* set plus data-work-url (rendered in the
    // frontmatter); this copies the selected slide's onto the link. Since
    // 2026-09-08 the lightbox (CommunityGrid) opens from THE SLIDES, all of
    // them, and only uses the link's href to know which one to start on —
    // so the href is the part that matters here, and the copied attributes
    // are a mirror that keeps the trigger describing what it points at.
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
      // deliberately href-less — its lightbox opens from the slides
      // (bindCardOpener), and an href written in would navigate out of an
      // unsaved form whenever that handler is not there to stop it.
      if (url && frameLink.hasAttribute("href")) frameLink.href = url;
      // Absent caption/description mean the attribute must GO, not be set to
      // "": PhotoSwipe's caption band tests the trimmed value, but a stale
      // attribute from the previous slide would survive a `?? ""` write.
      const copy = (from: string, to: string) => {
        const value = slide.dataset[from];
        if (value) frameLink.setAttribute(to, value);
        else frameLink.removeAttribute(to);
      };
      copy("pswpWidth", "data-pswp-width");
      copy("pswpHeight", "data-pswp-height");
      copy("pswpCaption", "data-pswp-caption");
      copy("pswpDescription", "data-pswp-description");
      copy("pswpLink", "data-pswp-link");
    };
    // The dots sit ABOVE the frame, so they are not descendants of the node
    // Embla was handed — they are queried from the card.
    const card = carousel.closest<HTMLElement>(".ccard") ?? carousel;
    const dots = Array.from(card.querySelectorAll<HTMLElement>(".ccard__dot"));
    // The position as text (2026-09-28): rendered by CommunityImageCard; the
    // editor's card preview builds only the dots, so it is added here.
    const dotRow = card.querySelector<HTMLElement>(".ccard__dots");
    let count = dotRow?.querySelector<HTMLElement>(".ccard__count") ?? null;
    if (dotRow && !count) {
      count = document.createElement("span");
      count.className = "ccard__count";
      // `select` only fires on a change; a card starts on its first work.
      count.textContent = `1 / ${slides.length}`;
      dotRow.prepend(count);
    }
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";

    const embla = EmblaCarousel(carousel, {
      // Named rather than left to Embla's "first child" default: the frame
      // also holds the click target, the arrows and the dots, and which of
      // them happens to be first is a markup detail nothing should depend on.
      container: ".ccard__track",
      slides: ".ccard__slide",
      // The hand-rolled carousel this replaced wrapped with a modulo; loop is
      // the same behaviour. Embla loops by translating the real slides, not
      // by cloning, so no image is ever duplicated into the DOM.
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

    liveCarousels.set(carousel, { embla });

    // Reduced motion: arrive rather than travel. Embla's `jump` argument is
    // the exact counterpart of the crossfade dropping its transition under
    // the same query. Read per call, never cached — the OS setting can
    // change while the page is open.
    const jump = () => REDUCED.matches;

    // Embla's slidesInView is scoped to the FRAME (its observer root is the
    // container's parent), so this fires for a slide entering the carousel's
    // own viewport — the documented lazy-load hook, and the only wake-up
    // that covers the arrow keys on a card no pointer ever entered.
    const hydrateInView = () => embla.slidesInView().forEach((i) => hydrate(images[i]));
    embla.on("slidesInView", hydrateInView);

    // Every move is somebody's doing now (no autoplay), so every move is
    // announced.
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
      if (count) count.textContent = `${i + 1} / ${slides.length}`;
      if (liveRegion) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(slides.length));
      }
    };
    embla.on("select", sync);

    // THE CAROUSEL FOLLOWS THE LIGHTBOX. When the lightbox (a separate module,
    // CommunityGrid) pages through this card's images, it dispatches this on
    // the slide now showing; the card underneath turns to the same picture,
    // so closing zooms back out onto the image the visitor was looking at
    // rather than onto the one they opened. A jump, not a travel: the card is
    // behind a full-screen picture while this happens, so there is nothing to
    // animate for.
    carousel.addEventListener("vscn:carousel-show", (e) => {
      const i = slides.indexOf(e.target as HTMLElement);
      if (i >= 0 && i !== embla.selectedScrollSnap()) embla.scrollTo(i, true);
    });

    // The edge arrows (desktop hover) — the card's accessible controls, named
    // by the markup (and by renderCardPreview for the editor's preview).
    const prevArrow = carousel.querySelector<HTMLElement>("[data-carousel-prev]");
    const nextArrow = carousel.querySelector<HTMLElement>("[data-carousel-next]");
    prevArrow?.addEventListener("click", () => embla.scrollPrev(jump()));
    nextArrow?.addEventListener("click", () => embla.scrollNext(jump()));
    // The count's own chevrons, "‹ 2 / 7 ›" (2026-09-28, src/lib/pager.ts).
    // Unlike the edge arrows they show on a phone too, where they are the
    // only thing that pages the card besides the swipe. They take the edge
    // arrows' names, so the two pairs are one control to a screen reader.
    if (dotRow) {
      ensurePagerChevron(dotRow, "prev", () => embla.scrollPrev(jump()), {
        label: prevArrow?.getAttribute("aria-label"),
      });
      ensurePagerChevron(dotRow, "next", () => embla.scrollNext(jump()), {
        label: nextArrow?.getAttribute("aria-label"),
      });
    }

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
    });

    // A drag must not navigate, and nothing here tracks a `swiped` flag any
    // more: Embla 8 owns that guard itself, with a capture-phase click
    // listener on the root that preventDefaults once the pointer has
    // travelled past dragThreshold. (clickAllowed() was the v7 API and is
    // gone from 8.x — the check moved inside the library.)
  });
}
