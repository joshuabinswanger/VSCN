/**
 * THE DETAILS BESIDE THE PICTURE, IN THE EDITOR (2026-10-31, Josh: "on
 * desktop i want to the right of the images carousel etc. to have a panel
 * ... a panel per image and carousel that contains the details", then: "i
 * was talking about the editor"). On a desktop with room for it, a work's
 * description fields and its two links stand in a soft card to the right of
 * the work's card, level with the top of the picture. The title, the More
 * fold and the text block stay under the picture. On a phone, or a window
 * too narrow for a card beside the column, nothing moves: the description
 * stays under the title and the links stay in More, as before.
 *
 * The NODES move, not copies: the controller wires each field once in
 * buildRow by querying the row, and every listener and value travels with
 * its element. Moving back puts each one where the template had it.
 *
 * Placement is MEASURED, not a formula: the side card goes at the right edge
 * of the work's own card (the carousel's card for a slide, which has none of
 * its own), and only where that edge plus the card still fits the window.
 * A row that is not laid out (hidden in Preview, another tab) keeps whatever
 * it had; refitInline() calls placeAllDetails again when it shows.
 */

/** The --bp-desktop query from custom-media.css, spelled out (see that file). */
const DESKTOP = "(767px < width) and ((not (pointer: coarse)) or (500px < height))";

/** The side card's width, the gap before it and the margin it keeps from the window edge, in rem. */
const SIDE_REM = 17;
const GAP_REM = 1.5;
const EDGE_REM = 1;

function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 13;
}

function descLabel(scope: Element | null | undefined, key: "description" | "descriptionDe"): HTMLElement | null {
  return scope?.querySelector(`[data-gallery-field="${key}"]`)?.closest<HTMLElement>("label.gfield") ?? null;
}

/** Move one row's description and links to the side card, or back home. */
function moveParts(row: HTMLElement, side: HTMLElement, toSide: boolean): void {
  const fields = row.querySelector<HTMLElement>(":scope > .gallery-fields");
  for (const [lang, key] of [["en", "description"], ["de", "descriptionDe"]] as const) {
    const home = fields?.querySelector<HTMLElement>(`:scope > [data-gallery-lang-pane="${lang}"]`);
    const away = side.querySelector<HTMLElement>(`[data-gallery-lang-pane="${lang}"]`);
    if (!home || !away) continue;
    const label = descLabel(toSide ? home : away, key);
    if (label) (toSide ? away : home).append(label);
  }
  const tools = row.querySelector<HTMLElement>(".gallery-details-body > .gallery-row-tools");
  const links = row.querySelector<HTMLElement>(".gallery-panel__sec");
  if (links && tools) {
    if (toSide) side.append(links);
    else tools.after(links);
  }
}

function fit(row: HTMLElement): void {
  row.querySelectorAll<HTMLTextAreaElement>("textarea.gallery-inline").forEach((el) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });
}

const watched = new WeakMap<HTMLElement, ResizeObserver>();

/** Keep the row at least as tall as its side card, so the card never runs into the next work. */
function watchHeight(row: HTMLElement, side: HTMLElement, on: boolean): void {
  if (!on) {
    watched.get(row)?.disconnect();
    watched.delete(row);
    row.style.removeProperty("--side-h");
    return;
  }
  if (watched.has(row) || typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(() => row.style.setProperty("--side-h", `${side.offsetHeight}px`));
  ro.observe(side);
  watched.set(row, ro);
}

/** Place one work row's details: beside its card when there is room on a desktop, under the picture otherwise. */
export function placeDetails(row: HTMLElement): void {
  const side = row.querySelector<HTMLElement>(":scope > .gallery-side");
  const thumb = row.querySelector<HTMLElement>(":scope > .gallery-thumb");
  if (!side || !thumb) return;
  const rowBox = row.getBoundingClientRect();
  // Not laid out: keep what it has, measure again when it shows.
  if (rowBox.width === 0) return;
  const card = row.closest<HTMLElement>(".gallery-carousel") ?? row;
  const rem = remPx();
  const left = card.getBoundingClientRect().right - rowBox.left + GAP_REM * rem;
  const roomy = rowBox.left + left + (SIDE_REM + EDGE_REM) * rem <= document.documentElement.clientWidth;
  const want = matchMedia(DESKTOP).matches && roomy;
  if (want !== row.classList.contains("has-side")) {
    moveParts(row, side, want);
    row.classList.toggle("has-side", want);
    side.hidden = !want;
    fit(row);
  }
  watchHeight(row, side, want);
  if (want) {
    row.style.setProperty("--side-left", `${Math.round(left)}px`);
    row.style.setProperty("--side-top", `${Math.round(thumb.getBoundingClientRect().top - rowBox.top)}px`);
    row.style.setProperty("--side-h", `${side.offsetHeight}px`);
  }
}

/** Every work row under `root`. Called by refitInline() and on resize. */
export function placeAllDetails(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".gallery-item").forEach(placeDetails);
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
