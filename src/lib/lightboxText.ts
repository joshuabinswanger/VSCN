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
 * on the picture's top-left corner; the text goes under a landscape image, and
 * beside a portrait one, where the empty paper already was.
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

/** How wide the column beside a portrait image may get, in px. */
const COLUMN_MAX = 340;

/**
 * THE SPACE THE WORDS NEED, RESERVED — the other half of the placement above.
 *
 * PhotoSwipe fits the image inside the viewport MINUS this padding, so these
 * numbers are what stops the artwork from growing over its own caption. They
 * are per-slide, which is the whole trick: `paddingFn` is handed the item's
 * data, so a portrait image reserves its space on the RIGHT and a landscape
 * one at the BOTTOM, and each shape is given back the space the other one
 * needed.
 *
 * `top` clears the top bar (3.5rem = 56px in lightbox.css) AND the artist line
 * that now sits between the bar and the picture. Raise the bar's height and
 * this has to follow, or the name lands under the hairline.
 *
 * The figures are measured, not guessed. A worst-case block — a 140-character
 * caption, a 600-character description and a long link — renders 88px tall at
 * a wide landscape measure (~1336px), 119px at 800px, and 227px in the 340px
 * portrait column. Landscape's 176 covers the narrowest image the ratio test
 * still calls landscape (~570px wide, ~150px of text) with room to spare;
 * portrait's column has the picture's full height beside it, so 227 is never
 * the binding constraint and its bottom reserve drops to 48.
 *
 * 192 rather than 176, which is where this started: a near-square image fits
 * a ~630px measure, the narrowest a landscape gets, and 176 leaves 146px of
 * usable height there against ~150 of text — four pixels short, which the
 * browser duly showed as a faded last line on a caption+description+link
 * block. The lesson is that the binding case is the NARROWEST landscape, not
 * the widest, because the reserve is one number for both.
 *
 * MOBILE IS THE ONE THAT CAN OVERRUN, knowingly: 351px of measure needs 227px
 * for that worst case and gets 150, because 227px of an 812px phone screen is
 * a quarter of the display given to text. The block scrolls (see lightbox.css)
 * — and 150 is already more than the 116 the old band reserved, so the case
 * that overruns here overran before as well.
 */
export function lightboxPadding(viewportSize: Point, itemData: SlideData) {
  const mobile = viewportSize.x <= MOBILE_MAX;
  const portrait = !mobile && isPortrait(itemData.width, itemData.height);
  if (mobile) return { top: 72, bottom: 150, left: 12, right: 12 };
  // A portrait image gives its bottom back and takes a column on the right.
  if (portrait) return { top: 92, bottom: 48, left: 32, right: 32 + COLUMN_MAX };
  return { top: 92, bottom: 192, left: 32, right: 32 };
}

/**
 * Taller than wide, with a deliberate margin: a 1.05:1 image is square to the
 * eye, and putting a text column beside one leaves the picture looking pushed
 * off-centre for a shape that gained nothing from the move. Only a decisively
 * upright picture buys the column.
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
}

function readTrigger(el: HTMLElement | undefined): TriggerText {
  return {
    caption: el?.dataset.pswpCaption?.trim() || "",
    description: el?.dataset.pswpDescription?.trim() || "",
    meta: el?.dataset.pswpMeta?.trim() || "",
    profile: el?.dataset.pswpProfile?.trim() || "",
    link: el?.dataset.pswpLink?.trim() || "",
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
          const { caption, description, link } = readTrigger(
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
          if (link) {
            const a = document.createElement("a");
            a.className = "pswp__vscn-text-link";
            a.href = link;
            a.target = "_blank";
            a.rel = "noreferrer";
            a.title = labels.linkTitle;
            a.textContent = linkLabel(link);
            el.append(a);
          }
          el.classList.toggle("is-empty", !caption && !description && !link);
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
    const beside = viewport.x > MOBILE_MAX && isPortrait(slide.width, slide.height);
    if (beside) {
      // The column: starts at the picture's right edge, runs to the window's
      // margin, capped. Top-aligned with the picture rather than centred on
      // it — a caption that starts level with the top of the artwork reads as
      // a label for it; one floating at its middle reads as a pull quote.
      const left = x + w + GAP;
      credit.style.width = "";
      text.style.left = `${Math.round(left)}px`;
      text.style.top = `${Math.round(y)}px`;
      text.style.width = `${Math.round(Math.min(COLUMN_MAX, viewport.x - left - 32))}px`;
      // Bounded so a long description cannot run past the foot of the window.
      text.style.maxHeight = `${Math.round(viewport.y - y - 32)}px`;
      markClipped(text);
    } else {
      // Under the picture, at the picture's own measure: the artwork sets the
      // column width, which is what makes the words look placed rather than
      // laid over the window.
      text.style.left = `${Math.round(x)}px`;
      text.style.top = `${Math.round(y + h + GAP)}px`;
      text.style.width = `${Math.round(w)}px`;
      text.style.maxHeight = `${Math.round(viewport.y - (y + h + GAP) - 16)}px`;
      markClipped(text);
    }
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
