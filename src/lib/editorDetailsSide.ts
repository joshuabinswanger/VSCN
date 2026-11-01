/**
 * THE SETTINGS BESIDE THE PICTURE, IN THE EDITOR (2026-10-31/11-01, Josh:
 * "Image Title, Description, Links all below it. All the settings in More to
 * the right of it. also the size and move buttons etc."). On a desktop with
 * room for it, a work's card keeps its picture and its WORDS — title,
 * description and both links, the links lifted out of More to sit under the
 * description — and a soft card to its right takes its SETTINGS: the head's
 * keys (size, move, remove) and everything More held (the project and
 * carousel pickers, the video thumbnail key, In gallery, Show description,
 * the tags). More itself is then empty and hidden. A carousel does the same
 * with its own head and its More (the project picker); its selected slide is
 * a work row and gets its own settings card, level with the slide's picture.
 *
 * On a phone, or a window too narrow for a card beside the column, nothing
 * moves: the head stays on top, the links and the settings stay in More.
 *
 * The NODES move, not copies: the controller and the tray wire each control
 * once by querying the row or the carousel, and every listener and value
 * travels with its element. Moving back restores the template's order.
 *
 * Placement is MEASURED, not a formula: the side card goes at the right edge
 * of the card (the carousel's for a slide, which has none of its own), level
 * with the picture (the tray, for a carousel), and only where that edge plus
 * the card still fits the window. A unit that is not laid out (hidden in
 * Preview, another tab) keeps what it had; refitInline() calls
 * placeAllDetails again when it shows.
 */

/** The --bp-desktop query from custom-media.css, spelled out (see that file). */
const DESKTOP = "(767px < width) and ((not (pointer: coarse)) or (500px < height))";

/** The side card's width, the gap before it, the margin it keeps from the window edge, and the gap between two stacked cards, in rem. */
const SIDE_REM = 17;
const GAP_REM = 1.5;
const EDGE_REM = 1;
const STACK_REM = 0.75;

function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 13;
}

/** A work row: its head and More's settings go to the side; the links go under the description. */
function moveWork(row: HTMLElement, side: HTMLElement, toSide: boolean): void {
  const head = row.querySelector<HTMLElement>(":scope > .gallery-boxhead") ?? side.querySelector<HTMLElement>(":scope > .gallery-boxhead");
  const body = row.querySelector<HTMLElement>(".gallery-details-body");
  const details = row.querySelector<HTMLElement>(".gallery-fields > .gallery-details");
  const deck = row.querySelector<HTMLElement>(".gallery-row-tools");
  const links = row.querySelector<HTMLElement>(".gallery-panel__sec");
  const tags = row.querySelector<HTMLElement>(".gallery-tags");
  if (toSide) {
    side.append(...[head, deck, tags].filter((el): el is HTMLElement => Boolean(el)));
    if (links && details) details.before(links);
  } else {
    if (head) row.prepend(head);
    body?.append(...[deck, links, tags].filter((el): el is HTMLElement => Boolean(el)));
  }
}

/** A carousel: its head and its More's deck go to the side. */
function moveCarousel(block: HTMLElement, side: HTMLElement, toSide: boolean): void {
  const head = block.querySelector<HTMLElement>(":scope > .gallery-boxhead") ?? side.querySelector<HTMLElement>(":scope > .gallery-boxhead");
  const body = block.querySelector<HTMLElement>(":scope > [data-carousel-details] > .gallery-details-body");
  const deck = (toSide ? body : side)?.querySelector<HTMLElement>(":scope > .gallery-row-tools") ?? null;
  if (toSide) {
    side.append(...[head, deck].filter((el): el is HTMLElement => Boolean(el)));
  } else {
    if (head) block.prepend(head);
    if (deck) body?.append(deck);
  }
}

function fit(unit: HTMLElement): void {
  unit.querySelectorAll<HTMLTextAreaElement>("textarea.gallery-inline").forEach((el) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });
}

const watched = new WeakMap<HTMLElement, ResizeObserver>();

/** Keep the unit at least as tall as its side card, so the card never runs into the next one. */
function watchHeight(unit: HTMLElement, side: HTMLElement, on: boolean): void {
  if (!on) {
    watched.get(unit)?.disconnect();
    watched.delete(unit);
    unit.style.removeProperty("--side-h");
    return;
  }
  if (watched.has(unit) || typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(() => unit.style.setProperty("--side-h", `${side.offsetHeight}px`));
  ro.observe(side);
  watched.set(unit, ro);
}

/** Place one unit — a work row or a carousel — beside its card when there is room on a desktop, in its card otherwise. */
export function placeDetails(unit: HTMLElement): void {
  const isCarousel = unit.classList.contains("gallery-carousel");
  const side = unit.querySelector<HTMLElement>(":scope > .gallery-side");
  const anchor = unit.querySelector<HTMLElement>(isCarousel ? ":scope > [data-carousel-tray]" : ":scope > .gallery-thumb");
  if (!side || !anchor) return;
  const box = unit.getBoundingClientRect();
  // Not laid out: keep what it has, measure again when it shows.
  if (box.width === 0) return;
  const card = isCarousel ? unit : (unit.closest<HTMLElement>(".gallery-carousel") ?? unit);
  const rem = remPx();
  const left = card.getBoundingClientRect().right - box.left + GAP_REM * rem;
  const roomy = box.left + left + (SIDE_REM + EDGE_REM) * rem <= document.documentElement.clientWidth;
  const want = matchMedia(DESKTOP).matches && roomy;
  if (want !== unit.classList.contains("has-side")) {
    (isCarousel ? moveCarousel : moveWork)(unit, side, want);
    unit.classList.toggle("has-side", want);
    side.hidden = !want;
    fit(unit);
  }
  watchHeight(unit, side, want);
  if (want) {
    unit.style.setProperty("--side-left", `${Math.round(left)}px`);
    unit.style.setProperty("--side-top", `${Math.round(anchor.getBoundingClientRect().top - box.top)}px`);
    unit.style.setProperty("--side-h", `${side.offsetHeight}px`);
  }
}

/**
 * A carousel's card and its selected slide's card stand in the same column
 * to the right of the carousel; the slide's is pushed down if the two would
 * touch.
 */
function unstack(block: HTMLElement): void {
  const own = block.querySelector<HTMLElement>(":scope > .gallery-side");
  const slide = block.querySelector<HTMLElement>("[data-carousel-slide-row] > .gallery-item.has-side");
  const slideSide = slide?.querySelector<HTMLElement>(":scope > .gallery-side");
  if (!own || own.hidden || !slide || !slideSide) return;
  const gap = STACK_REM * remPx();
  const overlap = own.getBoundingClientRect().bottom + gap - slideSide.getBoundingClientRect().top;
  if (overlap > 0) {
    const top = parseFloat(slide.style.getPropertyValue("--side-top")) || 0;
    slide.style.setProperty("--side-top", `${Math.round(top + overlap)}px`);
  }
}

/** Every carousel and work row under `root`. Called by refitInline() and on resize. */
export function placeAllDetails(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".gallery-carousel").forEach(placeDetails);
  root.querySelectorAll<HTMLElement>(".gallery-item").forEach(placeDetails);
  root.querySelectorAll<HTMLElement>(".gallery-carousel.has-side").forEach(unstack);
}

/** Re-place on resize, a frame at a time; torn down with the editor's lifecycle. */
export function bindDetailsPlacement(root: ParentNode, signal: AbortSignal): void {
  let queued = 0;
  const run = () => {
    queued = 0;
    placeAllDetails(root);
  };
  window.addEventListener(
    "resize",
    () => {
      if (!queued) queued = requestAnimationFrame(run);
    },
    { signal },
  );
  signal.addEventListener("abort", () => cancelAnimationFrame(queued));
}
