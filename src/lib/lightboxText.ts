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
import { pagerChevron } from "./pager.ts";

/** Below this the viewport is a phone: one column, and the text always below. */
const MOBILE_MAX = 767;
/** The CSS's --bp-mobile (custom-media.css): that width, OR a touch-first
 *  screen no taller than 500px, a phone turned sideways (lightbox.css), so
 *  the padding must agree with it. A tablet is desktop (2026-10-31). */
function mobileViewport(viewportSize: Point): boolean {
  if (viewportSize.x <= MOBILE_MAX) return true;
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (height <= 500px)").matches;
}

/**
 * The gap between the picture's edge and the words, in px. Matches the
 * `--space-*` rhythm loosely rather than exactly: this is measured against an
 * image edge, not against a text baseline, so it wants to be a hair looser
 * than a normal paragraph gap or the words read as part of the picture.
 */
const GAP = 20;

/**
 * THE SPACE THE WORDS NEED, RESERVED — the other half of the placement above.
 *
 * PhotoSwipe fits the image inside the viewport MINUS this padding and then
 * CENTRES it in what is left, so `top` and `bottom` together decide how big
 * the picture comes out and where it sits. THE WINDOW IS SPLIT BY HEIGHT
 * since 2026-10-13 (Josh: "10vh top padding, then a 60vh band for the image,
 * with the image centred inside it, then 30vh for the text"):
 *
 *   ┌ 10 % ┐  the controls row and the artist line, above the picture
 *   │ 60 % │  the picture, centred in this band whatever its shape
 *   └ 30 % ┘  the words
 *
 * It replaces a SYMMETRIC reserve (the same number over and under the
 * picture — 150 / 188 / 116 by shape and breakpoint, 2026-09-08 to
 * 2026-10-13), which centred the picture on the window's midline and left
 * the words whatever was under it: ~120px on a desktop landscape, less on a
 * phone, so a caption with any description at all hit the scroll-and-fade
 * in lightbox.css routinely. Josh: the text "gets too little room". The
 * split pays for the words with the picture's height — on a 900px window a
 * landscape stood 600px tall and now stands 540 — and makes the reserve
 * the same fraction of every window instead of a fixed pixel count.
 *
 * THE TOP CLEARS THE CONTROLS ROW. The row lost its band on 2026-09-06 (Josh:
 * "lose the top bar in lightbox") — the close word, zoom and preloader
 * survive in a cluster at the top right, on bare paper — and its height, 56
 * desktop (2.75rem plus air) and 44 on a phone, is a FLOOR: 10 % of a short
 * window (under 560px desktop, 440px phone) would put a wide picture under
 * the close word, and the artist line above its top-left corner with it, so
 * the floor takes over there and the picture's band gives up the difference.
 *
 * ONE RESERVE FOR EVERY SHAPE. The symmetric version reserved more under an
 * upright picture, which comes out narrow and wraps the same words taller.
 * The band gives a portrait the same 30 % — the lever, if it proves tight,
 * is BAND_TEXT, which trades picture height for room under it on every
 * shape at once.
 *
 * `paddingFn` is still handed the item's data; nothing here reads it now.
 */
// 17 / 60 / 23 since 2026-10-15 (Josh: "center images more on the vertical
// in photoswipe"): the picture's band moved down, its centre from 40 % to 47 %
// of the window; the words' band is shorter and scrolls past its foot.
const BAND_TOP = 0.17;
const BAND_TEXT = 0.23;
// The band between them, 60 %, is what the two leave the picture.

/** The controls row's height, which `top` may never fall under. */
const TOP_FLOOR_DESKTOP = 56;
const TOP_FLOOR_MOBILE = 44;

export function lightboxPadding(viewportSize: Point, _itemData: SlideData) {
  const mobile = mobileViewport(viewportSize);
  const top = Math.max(
    Math.round(viewportSize.y * BAND_TOP),
    mobile ? TOP_FLOOR_MOBILE : TOP_FLOOR_DESKTOP,
  );
  // The band stays reserved while the description is folded, so unfolding
  // it never moves the picture.
  const bottom = Math.round(viewportSize.y * BAND_TEXT);
  const side = mobile ? 12 : 32;
  return { top, bottom, left: side, right: side };
}

/** What the caption renderer reads off a trigger. All optional but width/height. */
interface TriggerText {
  caption: string;
  description: string;
  meta: string;
  profile: string;
  link: string;
  siteLink: string;
  project: string;
  projectLink: string;
  /** The project on the member's page, `/members/<slug>#project-<id>` (2026-11-04). */
  projectHref: string;
  affiliations: { name: string; href?: string }[];
}

/** The trigger's affiliations, tolerant of a missing or malformed attribute — a bad value shows nothing, never throws in a slide change. */
function parseAffiliations(raw: string | undefined): { name: string; href?: string }[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is { name: string; href?: string } => typeof a?.name === "string" && a.name.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

function readTrigger(el: HTMLElement | undefined): TriggerText {
  return {
    caption: el?.dataset.pswpCaption?.trim() || "",
    description: el?.dataset.pswpDescription?.trim() || "",
    meta: el?.dataset.pswpMeta?.trim() || "",
    profile: el?.dataset.pswpProfile?.trim() || "",
    link: el?.dataset.pswpLink?.trim() || "",
    siteLink: el?.dataset.pswpSiteLink?.trim() || "",
    project: el?.dataset.pswpProject?.trim() || "",
    projectLink: el?.dataset.pswpProjectLink?.trim() || "",
    projectHref: el?.dataset.pswpProjectHref?.trim() || "",
    affiliations: parseAffiliations(el?.dataset.pswpAffiliations),
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
  /** The links' visible words, by role: "Publication", "Link". */
  linkText: string;
  siteLinkText: string;
  /** "Part of", before a project's title. */
  partOf: string;
  /** "With", before a project's affiliations. */
  with: string;
  /** Accessible names for the counter's two chevrons. */
  prev: string;
  next: string;
  /** The title's dropdown, by what pressing it does. */
  hideText: string;
  showText: string;
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

    // ── The artist, pinned to the window's top-left ─────────────────────
    // (2026-10-14: "make the artist name stick to the top left" — the
    // paragraph below is the 09-04 reasoning for the line above the picture;
    // where it stands is lightbox.css's call now.)
    // (2026-09-04: "artist name alway left top of the image".) It was the last
    // line of the bottom band, under the description — the furthest point in
    // the layout from the picture, for the one piece of text that says whose
    // picture it is.
    //
    // Black and not underlined since 2026-10-15 (Josh: "artist name top left
    // without underline and black"): the name is still the link.
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

    // ── The counter, "‹ 2 / 7 ›", in the top row ────────────────────────
    // (2026-09-28.) The site's own count with chevrons that page, the same
    // pair the gallery card and the work carousel show (src/lib/pager.ts),
    // in the top row beside the + and Close, grey like them. It sat on the
    // artist line above the picture for part of that day, until Josh: "in
    // lightbox mode dont put it, just add it to the top row". On a phone the
    // chevrons are the only pager showing: PhotoSwipe keeps its side arrows
    // hidden until it sees a mouse. `counter: false` in lightbox.ts retires
    // the stock one; order 8 puts this after the preloader (7), before the
    // zoom (10) and the close word (20).
    ui.registerElement({
      name: "vscn-counter",
      className: "pswp__vscn-counter",
      appendTo: "bar",
      order: 8,
      onInit: (el, pswp) => {
        const count = document.createElement("span");
        count.className = "pswp__vscn-counter-count";
        el.append(
          pagerChevron("prev", () => pswp.prev(), { label: labels.prev }),
          count,
          pagerChevron("next", () => pswp.next(), { label: labels.next }),
        );
        const render = () => {
          count.textContent = `${pswp.currIndex + 1} / ${pswp.getNumItems()}`;
          // One picture has nowhere to page to.
          el.classList.toggle("is-empty", pswp.getNumItems() < 2);
        };
        pswp.on("change", render);
        render();
      },
    });

    // ── The words about the picture: a title under it, a sheet over it ──
    // THE TITLE IS THE DROPDOWN (2026-10-15, Josh: "the show more text should
    // be left aligned and be the title and drop down button to show the
    // description"). The caption sits left-aligned under the picture with a
    // chevron after it. A work with no caption still gets the chevron alone
    // (named by its aria-label); a work with nothing but a caption gets none.
    //
    // WHAT IT OPENS IS A SHEET (2026-11-04, Josh: "a way to read the long
    // descriptions comfortably ... a sheet that slides up", over the image on
    // desktop as well). From 10-15 the title unfolded the description IN
    // PLACE, inside the 23 % band under the picture: on a phone that was a
    // ~180px slot for a paragraph plus its links, scrolling inside itself,
    // with the links pressed against the browser's bottom edge where they
    // could not be hit. The sheet rises from the window's foot over the
    // picture, scrolls like a page, and pads its end clear of the home bar.
    // It sits OUTSIDE PhotoSwipe's scroll-wrap, so the picture around it
    // still drags, pinches and zooms, and a swipe inside it never pages.
    //
    // Open or shut holds while paging, so a reader who opened one description
    // reads the next one too; a new lightbox starts shut (this closure is
    // per open). Tap the title, swipe the sheet down or press Esc to shut it.
    let open = false;
    // Both elements register below; each fills in its half of `apply`.
    let applyHead: () => void = () => {};
    let applySheet: (focus: boolean) => void = () => {};
    const setOpen = (next: boolean, focus = false) => {
      open = next;
      applyHead();
      applySheet(focus);
    };

    ui.registerElement({
      name: "vscn-text",
      className: "pswp__vscn-text",
      appendTo: "root",
      order: 10,
      onInit: (el, pswp) => {
        const render = () => {
          const t = readTrigger(pswp.currSlide?.data.element as HTMLElement | undefined);
          const hasMore = hasSheetContent(t);
          el.replaceChildren();
          applyHead = () => {};
          if (t.caption || hasMore) {
            const head = document.createElement(hasMore ? "button" : "span");
            head.className = "pswp__vscn-text-head";
            if (t.caption) {
              const line = document.createElement("span");
              line.className = "pswp__vscn-text-caption";
              line.textContent = t.caption;
              head.append(line);
            }
            el.append(head);
            if (head instanceof HTMLButtonElement) {
              head.type = "button";
              head.setAttribute("aria-controls", SHEET_ID);
              const chev = document.createElement("span");
              chev.className = "pswp__vscn-text-chev";
              chev.setAttribute("aria-hidden", "true");
              head.append(chev);
              applyHead = () => {
                const name = open ? labels.hideText : labels.showText;
                head.setAttribute("aria-expanded", String(open));
                // A caption names the button itself; the chevron alone needs a name.
                if (!t.caption) head.setAttribute("aria-label", name);
                head.title = name;
                el.classList.toggle("is-open", open);
              };
              // A keyboard press moves focus into the sheet; a tap leaves it be.
              head.addEventListener("click", (e) => setOpen(!open, e.detail === 0));
              applyHead();
            }
          }
          el.classList.toggle("is-empty", !t.caption && !hasMore);
          // The next work's words FADE IN rather than swap (2026-10-16): the
          // block is rebuilt per slide, so a CSS transition has nothing to
          // start from. Same curve as --lb-ease in lightbox.css.
          fadeIn(el);
        };
        pswp.on("change", render);
        render();
      },
    });

    ui.registerElement({
      name: "vscn-sheet",
      className: "pswp__vscn-sheet",
      appendTo: "root",
      order: 11,
      onInit: (el, pswp) => {
        el.id = SHEET_ID;
        el.setAttribute("role", "region");

        // The grip and the title are the sheet's handle: tap to shut, or
        // drag down. The body below them is the part that scrolls.
        const handle = document.createElement("div");
        handle.className = "pswp__vscn-sheet-handle";
        const grip = document.createElement("span");
        grip.className = "pswp__vscn-sheet-grip";
        grip.setAttribute("aria-hidden", "true");
        const head = document.createElement("button");
        head.type = "button";
        head.className = "pswp__vscn-sheet-head";
        head.title = labels.hideText;
        head.setAttribute("aria-controls", SHEET_ID);
        head.setAttribute("aria-expanded", "true");
        const caption = document.createElement("span");
        caption.className = "pswp__vscn-sheet-caption";
        const chev = document.createElement("span");
        chev.className = "pswp__vscn-text-chev";
        chev.setAttribute("aria-hidden", "true");
        head.append(caption, chev);
        handle.append(grip, head);
        const body = document.createElement("div");
        body.className = "pswp__vscn-sheet-body";
        el.append(handle, body);

        let hasMore = false;
        applySheet = (focus: boolean) => {
          const shown = open && hasMore;
          el.classList.toggle("is-open", shown);
          el.toggleAttribute("inert", !shown);
          el.setAttribute("aria-hidden", String(!shown));
          pswp.element?.classList.toggle("pswp--vscn-sheet-open", shown);
          el.style.translate = "";
          if (!focus) return;
          if (shown) head.focus({ preventScroll: true });
          else pswp.element?.querySelector<HTMLElement>("button.pswp__vscn-text-head")?.focus({ preventScroll: true });
        };

        const render = () => {
          const t = readTrigger(pswp.currSlide?.data.element as HTMLElement | undefined);
          hasMore = hasSheetContent(t);
          caption.textContent = t.caption;
          head.setAttribute("aria-label", t.caption ? `${t.caption} — ${labels.hideText}` : labels.hideText);
          el.setAttribute("aria-label", t.caption || labels.showText);
          body.replaceChildren(...sheetContent(t, labels, pswp));
          body.scrollTop = 0;
          applySheet(false);
          if (open && hasMore) fadeIn(body);
        };

        head.addEventListener("click", () => {
          if (dragged) return;
          setOpen(false, true);
        });

        // SWIPE DOWN TO SHUT, on the handle. The sheet follows the finger
        // and goes past 70px or on a flick; short of that it springs back.
        let startY = 0;
        let startT = 0;
        let dy = 0;
        let dragging = false;
        let dragged = false;
        handle.addEventListener("pointerdown", (e) => {
          if (!open || e.button !== 0) return;
          dragging = true;
          dragged = false;
          startY = e.clientY;
          startT = e.timeStamp;
          dy = 0;
          handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener("pointermove", (e) => {
          if (!dragging) return;
          dy = Math.max(0, e.clientY - startY);
          if (dy > 6) {
            dragged = true;
            el.classList.add("is-dragging");
            el.style.translate = `0 ${dy}px`;
          }
        });
        const release = (e: PointerEvent) => {
          if (!dragging) return;
          dragging = false;
          el.classList.remove("is-dragging");
          const flick = dy > 24 && dy / Math.max(1, e.timeStamp - startT) > 0.5;
          if (dragged && (dy > 70 || flick)) setOpen(false);
          else el.style.translate = "";
          // The click that follows a drag must not count as a tap.
          if (dragged) setTimeout(() => (dragged = false), 0);
        };
        handle.addEventListener("pointerup", release);
        handle.addEventListener("pointercancel", release);

        // PhotoSwipe takes every wheel on its root (to pan the picture) and
        // cancels it, which would stop the sheet scrolling; stop it here.
        el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

        // ESC SHUTS THE SHEET FIRST, the lightbox on the next press. Keys
        // meant for the text — scrolling it, or pressing a link — are left
        // to the browser while focus is inside the sheet: PhotoSwipe would
        // otherwise pan the picture with the arrows.
        pswp.on("keydown", (ev) => {
          const e = ev.originalEvent;
          if (e.key === "Escape" && open && hasMore) {
            ev.preventDefault();
            setOpen(false, el.contains(document.activeElement));
            return;
          }
          if (el.contains(e.target as Node) && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Enter"].includes(e.key)) {
            ev.preventDefault();
          }
        });

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

/**
 * Says whether there is text past the block's bottom edge, which is the only
 * thing that makes the fade in lightbox.css appear. Read AFTER the width and
 * max-height are written, and again when the description unfolds, because
 * each changes the answer — and read off scrollHeight rather than predicted
 * from the character count, since where a paragraph wraps is the browser's
 * business.
 */
function markClipped(el: HTMLElement): void {
  el.classList.toggle("is-clipped", el.scrollHeight > el.clientHeight + 1);
}


/** The sheet's id, which both the title under the picture and the sheet's own head control. */
const SHEET_ID = "pswp-vscn-sheet";

/** Whether a work has anything for the sheet to hold beyond its title. */
function hasSheetContent(t: TriggerText): boolean {
  return Boolean(t.description || t.link || t.siteLink || t.project || t.affiliations.length);
}

function fadeIn(el: HTMLElement): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [{ opacity: 0, translate: "0 0.25rem" }, { opacity: 1, translate: "0 0" }],
    { duration: 360, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
  );
}

/** Same page, ignoring a trailing slash: the project is on the page under the lightbox. */
function samePage(url: URL): boolean {
  const strip = (p: string) => p.replace(/\/+$/, "") || "/";
  return url.origin === location.origin && strip(url.pathname) === strip(location.pathname);
}

/**
 * What the sheet holds under its title: the description, the piece's links,
 * the project it is part of and who it was made with. Member text throughout,
 * so textContent, never innerHTML.
 */
function sheetContent(t: TriggerText, labels: LightboxTextLabels, pswp: PhotoSwipe): Node[] {
  const out: Node[] = [];
  if (t.description) {
    const desc = document.createElement("p");
    desc.className = "pswp__vscn-text-desc";
    desc.textContent = t.description;
    out.push(desc);
  }
  // WHERE THIS IMAGE APPEARED (2026-09-04) and the member's own project page
  // (2026-09-10), by ROLE since 2026-10-16: "Link" and "Publication" (Josh).
  // The title carries the role and the host. Since 2026-11-04 the PROJECT's
  // own outside link joins them, labelled by its host as on the member page:
  // "Part of …" now goes to the project on VSCN instead (below).
  const projectSite = t.projectLink && t.projectLink !== t.siteLink && t.projectLink !== t.link ? t.projectLink : "";
  if (t.siteLink || t.link || projectSite) {
    const row = document.createElement("p");
    row.className = "pswp__vscn-text-links";
    const add = (href: string, text: string, title: string) => {
      const a = document.createElement("a");
      a.className = "pswp__vscn-text-link";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.title = title ? `${title} — ${linkLabel(href)}` : linkLabel(href);
      a.textContent = text;
      row.append(a);
    };
    if (t.siteLink) add(t.siteLink, labels.siteLinkText, labels.siteLinkTitle);
    if (t.link) add(t.link, labels.linkText, labels.linkTitle);
    if (projectSite) add(projectSite, linkLabel(projectSite).split("/")[0], "");
    out.push(row);
  }
  // THE PROJECT THIS PICTURE IS PART OF (2026-09-23), and since 2026-11-04
  // (Josh: "a way to navigate to the projects from the lightbox") a link to
  // that project on the member's page, `/members/<slug>#project-<id>`. On
  // another page the router takes it and the lightbox goes with the swap;
  // on the member's own page the lightbox closes and the page scrolls to the
  // project. No href (the editor's preview) prints the title plain.
  if (t.project) {
    const line = document.createElement("p");
    line.className = "pswp__vscn-text-project";
    line.append(`${labels.partOf} `);
    const name = document.createElement(t.projectHref ? "a" : "span");
    name.textContent = t.project;
    if (name instanceof HTMLAnchorElement) {
      name.href = t.projectHref;
      name.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
        const url = new URL(name.href, location.href);
        if (!samePage(url)) return;
        e.preventDefault();
        const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
        pswp.on("destroy", () => {
          const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
          target?.scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" });
        });
        pswp.close();
      });
    }
    line.append(name);
    out.push(line);
  }
  if (t.affiliations.length) {
    const line = document.createElement("p");
    line.className = "pswp__vscn-text-affiliations";
    line.append(`${labels.with} `);
    t.affiliations.forEach((a, i) => {
      if (i > 0) line.append(" · ");
      const node = document.createElement(a.href ? "a" : "span");
      node.textContent = a.name;
      if (node instanceof HTMLAnchorElement && a.href) {
        node.href = a.href;
        // A member credit is on-site (ClientRouter picks it up); an external one opens a tab.
        if (/^https?:/i.test(a.href)) { node.target = "_blank"; node.rel = "noopener"; }
      }
      line.append(node);
    });
    out.push(line);
  }
  return out;
}

function attachPlacement(pswp: PhotoSwipe): void {

  const place = () => {
    const root = pswp.element;
    const text = root?.querySelector<HTMLElement>(".pswp__vscn-text");
    const slide = pswp.currSlide;
    if (!root || !text || !slide) return;

    // THE WORDS ARE HIDDEN WHILE ZOOMED IN. The block is glued to the picture's
    // rect, and a zoomed picture's rect is mostly off-screen — following it
    // would drag the caption out of the window. A reader who has zoomed in is
    // looking at the picture, not reading about it. (The artist line is not
    // glued to the picture any more and stays: see the credit's rule in
    // lightbox.css.) Compared against the slide's own initial level rather than 1: a
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

    // THE ARTIST LINE IS NOT PLACED HERE (2026-10-14, Josh: "make the artist
    // name stick to the top left"). It is pinned to the window's top-left in
    // lightbox.css, in the controls row's height, so it stays in one place
    // from slide to slide and through zoom instead of floating at whatever
    // height the picture's centring left its corner.

    const viewport = pswp.viewportSize;
    // In the words' band, at the picture's own measure, on every shape: the
    // artwork sets the column width, which is what makes the words look placed
    // rather than laid over the window. A portrait picture got a column to its
    // right instead from 09-04 to 09-06 — see the header and lightboxPadding
    // for why that went.
    // THE TOP IS THE PICTURE'S (2026-10-16, Josh: "wide images have a gap to
    // the description"). From 10-13 the words started at the band's foot, so
    // they sat at one height on every slide. But a wide picture is centred in
    // its 60 % band, which left a hole between its bottom edge and the title.
    // Now the title hangs off the picture itself, GAP below it, whatever its
    // shape. The band below stays reserved (lightboxPadding), so the room
    // under a wide picture only grows.
    // Bounded so a long description cannot run past the foot of the window;
    // past that it scrolls, and markClipped shows the fade that says so.
    const top = y + h + GAP;
    text.style.left = `${Math.round(x)}px`;
    text.style.top = `${Math.round(top)}px`;
    text.style.width = `${Math.round(w)}px`;
    text.style.maxHeight = `${Math.round(viewport.y - top - 16)}px`;
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
