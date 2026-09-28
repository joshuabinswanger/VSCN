// THE CHEVRONS BESIDE A COUNT — "‹ 2 / 7 ›" — shared by the gallery card, a
// project's carousel on the member page and the lightbox (2026-09-28, Josh:
// the three pagers should match). One button, drawn by `.pager-chev` in
// global.css; each engine decides what a press does.
//
// WHAT THEY ARE TO A SCREEN READER (2026-09-28). Every chevron is a named
// button — "Previous image" / "Vorheriges Bild", or the label its carousel
// already gives its edge arrows — and its row is NOT aria-hidden, so the pair
// and the count can be reached and pressed with a virtual cursor. On the card
// and the project carousel they are `tabindex="-1"`: a directory holds a
// couple of dozen cards, and two tab stops per card would put fifty stops in
// front of the member links that are the page's actual journey, to duplicate
// what the frame's arrow keys (communityCarousel.ts, and the project track's
// native scroll) already do. The lightbox's pair keeps its tab stops: it is
// one modal with a handful of stops, and PhotoSwipe's own side arrows only
// show once a mouse has been seen, so on a keyboard these are the visible
// pager.

/** The default names, by the document's language. */
export function pagerLabel(dir: "prev" | "next"): string {
  const de = document.documentElement.lang === "de";
  if (dir === "prev") return de ? "Vorheriges Bild" : "Previous image";
  return de ? "Nächstes Bild" : "Next image";
}

/**
 * A prev/next chevron button for a count row. `label` names it (falls back
 * to pagerLabel); `focusable: false` takes it out of the tab order while
 * leaving it in the accessibility tree — see the header.
 */
export function pagerChevron(
  dir: "prev" | "next",
  onPress: () => void,
  opts: { label?: string | null; focusable?: boolean } = {},
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `pager-chev pager-chev--${dir}`;
  if (opts.focusable === false) button.tabIndex = -1;
  const label = opts.label || pagerLabel(dir);
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = '<span aria-hidden="true"></span>';
  button.addEventListener("click", onPress);
  return button;
}

/**
 * Wires a server-rendered chevron if the row has one, or builds and places
 * it. For the card's count row: named, reachable, not a tab stop; the row's
 * aria-hidden (if the markup still carries one) comes off, because a row
 * holding two named buttons is not decoration.
 */
export function ensurePagerChevron(
  row: HTMLElement,
  dir: "prev" | "next",
  onPress: () => void,
  opts: { label?: string | null } = {},
): HTMLButtonElement {
  row.removeAttribute("aria-hidden");
  const label = opts.label || pagerLabel(dir);
  const found = row.querySelector<HTMLButtonElement>(`.pager-chev--${dir}`);
  if (found) {
    found.tabIndex = -1;
    found.title = label;
    found.setAttribute("aria-label", label);
    found.addEventListener("click", onPress);
    return found;
  }
  const made = pagerChevron(dir, onPress, { label, focusable: false });
  if (dir === "prev") row.prepend(made);
  else row.append(made);
  return made;
}
