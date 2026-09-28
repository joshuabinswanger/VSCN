import type PhotoSwipeLightbox from "photoswipe/lightbox";
// The options, the words, the video slides and the card's whole-gallery
// opener: one lightbox for the whole site, defined once in lib/lightbox.ts.
import { CARD_TRIGGER, bindCardOpener, createLightbox, parseLightboxStrings } from "./lightbox.ts";
import "photoswipe/style.css";
// Immediately after the package sheet, never before: this is the chrome that
// replaces it. Same pair, same order, as the member profile page.
import "../styles/lightbox.css";

// ────────────────────────────────────────────────────────────────────────
// THE WALL'S LIGHTBOX — a third module, alongside the deal and the motion
// layer, and independent of both (the three <script> blocks in this file are
// SEPARATE ES modules; nothing here can call applyLayout).
//
// WHY THE WALL AND NOT THE SPREAD. On a tile the picture and the person are
// two different destinations: pressing the artwork opens the artwork, and
// the author's name — the only other thing the tile says — goes to the
// profile. The spread's member cards are unchanged: there the name sits
// above the frame, the frame pages a whole gallery, and the card as a whole
// still means "this member".
//
// NOTHING RE-INITIALISES THIS ON A DEAL, deliberately. The click listener
// binds to #member-grid, which survives every deal (cells are moved inside
// it, never replaced), and PhotoSwipe resolves `children` at CLICK time —
// so a filtered wall, a re-shuffled wall and a wall that has just come back
// from the spread all open the right slide without this module hearing about
// any of it. That is also why the selector carries `:not([hidden])`: the
// spread's member cards and the tags filter's rejects are in the DOM, and
// without it a wall showing fifteen tiles would page through forty-eight.
// ────────────────────────────────────────────────────────────────────────

// THE WALL'S TRIGGERS. The wall's tile wraps its own image (.cwork__link),
// one per work, so PhotoSwipe can page the whole wall straight off the DOM.
// `:not([hidden])` keeps the filter's rejects — and the gallery's member
// cells, which the deal hides for the wall — out of the count.
const WALL_TRIGGERS = ".cgrid__cell:not([hidden]) .cwork__link";

// THE GALLERY'S TRIGGER is NOT in that list, since 2026-09-08. The card puts
// one bare link over its carousel (.ccard__frame-link), and as a PhotoSwipe
// child that link was ONE item — the lightbox paged from card to card,
// showing each member's currently selected picture and nothing else of
// theirs (Josh: "photoswipe should pick all images in the gallery ... not
// only the currently showing one"). So the gallery's click is intercepted
// below (openCard) and the lightbox is handed the card's SLIDES instead:
// every image the carousel holds, opened on the one that was showing.
//
// THE GALLERY'S TRIGGER WAS MISSING ENTIRELY until 2026-09-01, which is what
// "the lightbox is broken in Gallery" was: PhotoSwipe swallows the click on
// a gallery it owns even when the selector matches nothing, so pressing an
// image did not open the lightbox AND did not follow the link either. The
// interceptor is what stands in for it now; if it ever fails to bind, the
// link falls through to its href and opens the original in a new tab.
// CARD_TRIGGER and the interceptor itself now live in lib/lightbox.ts
// (bindCardOpener), shared with the profile editor's preview card.

// Rebuilt per navigation: ClientRouter swaps the document, so a lightbox
// bound to the previous page's grid would be holding a dead element.
let lightbox: PhotoSwipeLightbox | null = null;
// The gallery card's click interceptor (see bindCardOpener), unbound whenever
// the lightbox is.
let unbindCard: (() => void) | null = null;

const teardown = () => {
  lightbox?.destroy();
  lightbox = null;
  unbindCard?.();
  unbindCard = null;
};

document.addEventListener("astro:page-load", () => {
  teardown();
  const grid = document.getElementById("member-grid");
  if (!grid || !grid.querySelector(`${WALL_TRIGGERS}, ${CARD_TRIGGER}`)) return;

  // Chrome identical to the member page's, on purpose — it is the same
  // function — so the two galleries never look like two different lightboxes.
  lightbox = createLightbox(parseLightboxStrings(grid.dataset.pswpI18n), {
    gallery: "#member-grid",
    children: WALL_TRIGGERS,
  });
  // THE GALLERY CARD OPENS AS A WHOLE — every slide of the card, starting on
  // the one showing; the reasoning is on bindCardOpener.
  unbindCard = bindCardOpener(grid, lightbox);
  lightbox.init();
});

document.addEventListener("astro:before-swap", teardown);
