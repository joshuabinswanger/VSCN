/**
 * THE LIGHTBOX'S WORDS — the artist, the caption, the description, the link.
 *
 * PhotoSwipe 5 ships no caption at all, so all of this is UI registered
 * through `uiRegister`, filled from the trigger link's `data-pswp-*` set. Text
 * comes off the trigger and nowhere else, so the lightbox and the tile
 * underneath it cannot say different things about the same image.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO COPIES ─────────────────────────────
 * There are two galleries on this site — the directory (CommunityGrid) and a
 * member's own page (members/[slug].astro) — and until 2026-09-04 each carried
 * its own copy of this renderer, ~90 lines that had to be edited in lockstep
 * and were annotated in both places with a note saying so. There is ONE
 * lightbox on this site; it must not speak differently depending on where it
 * was opened from, and the cheapest way to guarantee that is for there to be
 * one renderer.
 *
 * ── WHY IT MEASURES THE PICTURE ─────────────────────────────────────────
 * (2026-09-04, Josh: "lose the bars ... the description should be below for a
 * horizontal image and to the right if vertical. artist name alway left top of
 * the image".)
 *
 * It used to be a band: full width, its own background, a hairline along the
 * top, pinned to the foot of the screen. A band is a piece of page furniture,
 * and it made the words belong to the WINDOW rather than to the artwork —
 * which on a portrait image meant a paragraph stretched across the bottom of
 * the screen with two columns of empty paper either side of the picture it was
 * describing.
 *
 * So nothing here is pinned to the viewport. Every block is positioned off the
 * picture's own rendered rectangle, read out of PhotoSwipe's slide geometry
 * (`pan` and `currZoomLevel`) on every event that can move it. The artist sits
 * on the picture's top-left corner; the text goes under the picture, at the
 * picture's own width.
 *
 * UNDER EVERY SHAPE, since 2026-09-06 (Josh: "put the text always below the
 * images"). From 09-04 to 09-06 a portrait picture got a column to its right
 * instead, where the empty paper was. That put the words in a different place
 * for each shape, and paging from a landscape to a portrait moved the eye from
 * under the picture to beside it — two layouts, read as two, on what is one
 * gallery. One arrangement now; what changes per shape is only how much room
 * is reserved under the picture, see lightboxPadding.
 *
 * The cost of this is real and worth naming: the position is JS, so it has to
 * be recomputed on `change`, `resize`, `initialZoomPan` and `zoomPanUpdate`,
 * and any PhotoSwipe upgrade that renames `pan` or `currZoomLevel` breaks the
 * layout rather than degrading it. `paddingFn` reserving the space is the CSS
 * half of the same contract — see LIGHTBOX_PADDING.
 */
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type PhotoSwipe from "photoswipe";
import type { SlideData, Point } from "photoswipe";

/** Below this the viewport is a phone: one column, and the text always below. */
const MOBILE_MAX = 767;

/**
 * The gap between the picture's edge and the words, in px. Matches the
 * `--space-*` rhythm loosely rather than exactly: this is measured against an
 * image edge, not against a text baseline, so it wants to be a hair looser
 * than a normal paragraph gap or the words read as part of the picture.
 */
const GAP = 14;

/**
 * THE SPACE THE WORDS NEED, RESERVED — the other half of the placement above.
 *
 * PhotoSwipe fits the image inside the viewport MINUS this padding and then
 * CENTRES it in what is left, so these two numbers do two jobs at once: their
 * SUM sets how big the picture comes out, and their DIFFERENCE decides where
 * it sits. That second job was the bug. The reserve used to be 56 over the
 * picture and 192 under it, and half of that 136px difference is 68px of lift:
 * the picture opened 68px above the middle of the window, and what read as
 * centred was the GROUP — picture and words together, 56px of paper above,
 * 63px below. Josh, 2026-09-08: "the image only should define the centering of
 * the content." So top and bottom are now the SAME number.
 *
 * THE SUM IS PRESERVED, deliberately: 124 + 124 is the 56 + 192 the old pair
 * added up to, 156 + 156 the old 56 + 256, 97 + 97 the phone's 44 + 150. The
 * picture therefore comes out at exactly the size it did before this change
 * and only moves — the artwork gives up nothing to gain its centre. What pays
 * instead is the room under it, which is now half the sum rather than all of
 * the bottom of it: a landscape's words get 124px of it, minus the GAP and a
 * 16px foot, so ~94px of usable height where they had ~162. A caption with a
 * description of any length overruns that and falls to the scroll-and-fade in
 * lightbox.css — routinely, not rarely. That is the accepted price of the
 * centre; the lever if it ever proves too tight is to raise BOTH numbers
 * together, which buys height under the picture by taking it off the picture.
 *
 * `paddingFn` is still handed the item's data, and the reserve still follows
 * the SHAPE: an upright picture comes out narrow — a 2:3 image in a 900px
 * window is ~390px wide — and a narrow measure wraps the same words taller,
 * roughly 85,000 ÷ measure px for a worst-case block (a 140-character caption,
 * a 600-character description and a long link). 156 against 124 is that
 * difference, carried over unchanged from the old 256 against 192.
 *
 * THE TOP IS NO LONGER THE CONTROLS ROW, it merely clears it. The row lost its
 * band on 2026-09-06 (Josh: "lose the top bar in lightbox") — the close word,
 * zoom, counter and preloader survive in a cluster at the top right, on bare
 * paper — and `top` was sized to exactly that row's height, 56 desktop (2.75rem
 * plus air) and 44 on a phone. Every number here is now comfortably above it,
 * so the row is a FLOOR rather than the value: nothing in this function may
 * fall below 56 desktop / 44 phone, or a wide picture runs under the close
 * word and the artist line above its top-left corner goes with it.
 */

/**
 * Half of the old top + bottom, per shape, then bumped ~20% — Josh, 2026-09-08
 * (second pass): "make the image a bit smaller". The symmetry stays exact
 * (still SAME number top and bottom, still 56/44 as the floor); only the sum
 * grows, which is the lever the comment above names for buying room under the
 * picture by taking it off the picture — used here to trim the picture a
 * little rather than to fit more text.
 */
const RESERVE_LANDSCAPE = 150; // was 124 (56 over, 192 under, pre-centring)
const RESERVE_PORTRAIT = 188; // was 156 (56 over, 256 under, pre-centring)
const RESERVE_MOBILE = 116; // was 97 (44 over, 150 under, pre-centring)

export function lightboxPadding(viewportSize: Point, itemData: SlideData) {
  const mobile = viewportSize.x <= MOBILE_MAX;
  if (mobile) {
    return { top: RESERVE_MOBILE, bottom: RESERVE_MOBILE, left: 12, right: 12 };
  }
  // Equal over and under, so the PICTURE is what sits in the middle of the
  // window; an upright one reserves more on both sides, because it comes out
  // narrower and its words wrap taller.
  const reserve = isPortrait(itemData.width, itemData.height)
    ? RESERVE_PORTRAIT
    : RESERVE_LANDSCAPE;
  return { top: reserve, bottom: reserve, left: 32, right: 32 };
}

/**
 * Taller than wide, with a deliberate margin. This used to choose the
 * ARRANGEMENT (a column beside the picture, 09-04 to 09-06) and now chooses
 * the RESERVE under it: a 1.05:1 image is square to the eye and comes out
 * nearly as wide as a landscape, so it wraps its words about as tall; only a
 * decisively upright picture is narrow enough to need the deeper reserve.
 */
function isPortrait(width: number | undefined, height: number | undefined): boolean {
  if (!width || !height) return false;
  return height / width >= 1.15;
}

/** What the caption renderer reads off a trigger. All optional but width/height. */
interface TriggerText {
  caption: string;
  description: string;
  meta: string;
  profile: string;
  link: string;
  siteLink: string;
}

function readTrigger(el: HTMLElement | undefined): TriggerText {
  return {
    caption: el?.dataset.pswpCaption?.trim() || "",
    description: el?.dataset.pswpDescription?.trim() || "",
    meta: el?.dataset.pswpMeta?.trim() || "",
    profile: el?.dataset.pswpProfile?.trim() || "",
    link: el?.dataset.pswpLink?.trim() || "",
    siteLink: el?.dataset.pswpSiteLink?.trim() || "",
  };
}

/**
 * Strips the scheme for display, keeping the href intact. "nature.com/articles/…"
 * is what the member typed and what the profile page prints; showing them
 * "https://nature.com/articles/…" in the lightbox would be the lightbox
 * inventing a detail the rest of the site hides.
 */
function linkLabel(href: string): string {
  return href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export interface LightboxTextLabels {
  /** Accessible name for the "where this appeared" link, e.g. "Where this image appeared". */
  linkTitle: string;
  /** Accessible name for the member's own-site link, e.g. "This piece on the maker's own site". */
  siteLinkTitle: string;
}

/**
 * Registers the artist line and the text block on a lightbox, and keeps both
 * glued to the picture. Call inside the `uiRegister` handler's owner — this
 * attaches its own `uiRegister` listener, so it must run before `init()`.
 */
export function registerLightboxText(
  lightbox: PhotoSwipeLightbox,
  labels: LightboxTextLabels,
): void {
  lightbox.on("uiRegister", () => {
    const ui = lightbox.pswp?.ui;
    if (!ui) return;

    // ── The artist, on the picture's top-left corner ────────────────────
    // (2026-09-04: "artist name alway left top of the image".) It was the last
    // line of the bottom band, under the description — the furthest point in
    // the layout from the picture, for the one piece of text that says whose
    // picture it is.
    //
    // It stays the ROUTE OUT (2026-09-03, Josh: "in lightbox a way to get to
    // the profile of a person"): the lightbox is the whole screen, so every
    // link the page offered to a member is underneath it. The name itself is
    // the control rather than a "View profile" button beside it — the name is
    // the only thing here that is about the person, so making it the control
    // keeps this one line instead of two.
    //
    // Falls back to a plain span when the trigger carries no profile href: on
    // a member's own page the person whose page you are on is not somewhere to
    // go. An <a> when there is one, so ClientRouter picks the navigation up
    // and the lightbox is destroyed by its own astro:before-swap handler.
    ui.registerElement({
      name: "vscn-credit",
      className: "pswp__vscn-credit",
      appendTo: "root",
      order: 9,
      onInit: (el, pswp) => {
        const render = () => {
          const { meta, profile } = readTrigger(
            pswp.currSlide?.data.element as HTMLElement | undefined,
          );
          el.replaceChildren();
          if (meta) {
            // textContent, not innerHTML: this is member-authored text.
            const credit = document.createElement(profile ? "a" : "span");
            credit.className = "pswp__vscn-credit-name";
            if (credit instanceof HTMLAnchorElement) credit.href = profile;
            credit.textContent = meta;
            el.append(credit);
          }
          // A class rather than `hidden`: the element's own `display` would
          // outrank the UA sheet's [hidden] rule. Same trap as ProfileForm's.
          el.classList.toggle("is-empty", !meta);
        };
        pswp.on("change", render);
        render();
      },
    });

    // ── The words about the picture ─────────────────────────────────────
    ui.registerElement({
      name: "vscn-text",
      className: "pswp__vscn-text",
      appendTo: "root",
      order: 10,
      onInit: (el, pswp) => {
        const render = () => {
          const { caption, description, link, siteLink } = readTrigger(
            pswp.currSlide?.data.element as HTMLElement | undefined,
          );
          el.replaceChildren();
          if (caption) {
            const line = document.createElement("span");
            line.className = "pswp__vscn-text-caption";
            line.textContent = caption;
            el.append(line);
          }
          if (description) {
            const desc = document.createElement("span");
            desc.className = "pswp__vscn-text-desc";
            desc.textContent = description;
            el.append(desc);
          }
          // WHERE THIS IMAGE APPEARED (2026-09-04, from the sketch: "DESC
          // (WITH LINKS)"). The field has existed since the projects feature
          // was withdrawn and its only surface was the member's own page, so
          // an image opened from the directory lost the paper it illustrates.
          // Stored without a scheme and rendered with one — the same split
          // href()/workLink() make everywhere else on the site.
          //
          // TWO LINKS SINCE 2026-09-10 (Josh: "the image link should be
          // additional"): the member's own project page first, the
          // publication second, on one row. Both print as bare hosts — the
          // `title` is what says which is which, to a hover and to a reader.
          if (siteLink || link) {
            const row = document.createElement("span");
            row.className = "pswp__vscn-text-links";
            const add = (href: string, title: string) => {
              const a = document.createElement("a");
              a.className = "pswp__vscn-text-link";
              a.href = href;
              a.target = "_blank";
              a.rel = "noopener";
              a.title = title;
              a.textContent = linkLabel(href);
              row.append(a);
            };
            if (siteLink) add(siteLink, labels.siteLinkTitle);
            if (link) add(link, labels.linkTitle);
            el.append(row);
          }
          el.classList.toggle("is-empty", !caption && !description && !link && !siteLink);
          // The block can scroll; a slide change has to start it at the top or
          // the next description opens mid-paragraph.
          el.scrollTop = 0;
        };
        pswp.on("change", render);
        render();
      },
    });

    // ── Placement ───────────────────────────────────────────────────────
    // Both blocks are absolutely positioned in the root and moved here, off
    // the picture's rendered rect. Written once for both, on the pswp instance
    // rather than inside either onInit, because the two have to agree about
    // where the picture is and reading the geometry twice per event to tell
    // them the same thing would be the bug waiting to happen.
    const pswp = lightbox.pswp;
    if (pswp) attachPlacement(pswp);
  });
}

function attachPlacement(pswp: PhotoSwipe): void {
  /**
   * Says whether there is text past the block's bottom edge, which is the only
   * thing that makes the fade in lightbox.css appear. Read AFTER the width and
   * max-height above are written, because both change the answer — and read
   * off scrollHeight rather than predicted from the character count, since
   * where a paragraph wraps is the browser's business.
   */
  const markClipped = (el: HTMLElement) => {
    el.classList.toggle("is-clipped", el.scrollHeight > el.clientHeight + 1);
  };

  const place = () => {
    const root = pswp.element;
    const credit = root?.querySelector<HTMLElement>(".pswp__vscn-credit");
    const text = root?.querySelector<HTMLElement>(".pswp__vscn-text");
    const slide = pswp.currSlide;
    if (!root || !credit || !text || !slide) return;

    // HIDDEN WHILE ZOOMED IN. The blocks are glued to the picture's rect, and
    // a zoomed picture's rect is mostly off-screen — following it would drag
    // the caption out of the window and the artist line under the top bar. A
    // reader who has zoomed in is looking at the picture, not reading about
    // it. Compared against the slide's own initial level rather than 1: a
    // small image opens BELOW 1:1 and a large one above it, so 1 is not the
    // resting state of anything.
    const initial = slide.zoomLevels?.initial ?? 1;
    const zoomed = (slide.currZoomLevel ?? initial) > initial * 1.02;
    root.classList.toggle("pswp--vscn-zoomed-words", zoomed);
    if (zoomed) return;

    const zoom = slide.currZoomLevel || 1;
    const w = (slide.width || 0) * zoom;
    const h = (slide.height || 0) * zoom;
    const x = slide.pan?.x ?? 0;
    const y = slide.pan?.y ?? 0;
    if (!w || !h) return;

    // Left-aligned to the picture's left edge and sitting just above its top
    // edge — translateY(-100%) in the stylesheet does the lift, so the line's
    // own height never has to be measured here.
    credit.style.left = `${Math.round(x)}px`;
    credit.style.top = `${Math.round(y - GAP)}px`;

    const viewport = pswp.viewportSize;
    // Under the picture, at the picture's own measure, on every shape: the
    // artwork sets the column width, which is what makes the words look placed
    // rather than laid over the window. A portrait picture got a column to its
    // right instead from 09-04 to 09-06 — see the header and lightboxPadding
    // for why that went, and what the reserve does about the narrower measure.
    // Bounded so a long description cannot run past the foot of the window;
    // past that it scrolls, and markClipped shows the fade that says so.
    text.style.left = `${Math.round(x)}px`;
    text.style.top = `${Math.round(y + h + GAP)}px`;
    text.style.width = `${Math.round(w)}px`;
    text.style.maxHeight = `${Math.round(viewport.y - (y + h + GAP) - 16)}px`;
    markClipped(text);
  };

  // Every event that can move the picture. `change` for a new slide,
  // `initialZoomPan` for the position it opens at (which is set AFTER change),
  // `resize` for the window, `zoomPanUpdate` for the rest — including each
  // frame of the open and close animations, which is why `place` reads state
  // and writes styles and does nothing else.
  pswp.on("change", place);
  pswp.on("initialZoomPan", place);
  pswp.on("resize", place);
  pswp.on("zoomPanUpdate", place);
}
