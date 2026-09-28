// THE CHEVRONS BESIDE A COUNT — "‹ 2 / 7 ›" — shared by the gallery card, a
// project's carousel on the member page and the lightbox (2026-09-28, Josh:
// the three pagers should match). One button, drawn by `.pager-chev` in
// global.css; each engine decides what a press does.

/**
 * A prev/next chevron button for a count row. `focusable: false` for a row
 * that is aria-hidden because the carousel's own edge arrows are its
 * accessible controls (card, project carousel); the lightbox's are real
 * controls and keep their tab stop and name.
 */
export function pagerChevron(
  dir: "prev" | "next",
  onPress: () => void,
  opts: { label?: string; focusable?: boolean } = {},
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `pager-chev pager-chev--${dir}`;
  if (opts.focusable === false) button.tabIndex = -1;
  if (opts.label) {
    button.title = opts.label;
    button.setAttribute("aria-label", opts.label);
  }
  button.innerHTML = '<span aria-hidden="true"></span>';
  button.addEventListener("click", onPress);
  return button;
}

/** Wires a server-rendered chevron if the row has one, or builds and places it. */
export function ensurePagerChevron(
  row: HTMLElement,
  dir: "prev" | "next",
  onPress: () => void,
): HTMLButtonElement {
  const found = row.querySelector<HTMLButtonElement>(`.pager-chev--${dir}`);
  if (found) {
    found.addEventListener("click", onPress);
    return found;
  }
  const made = pagerChevron(dir, onPress, { focusable: false });
  if (dir === "prev") row.prepend(made);
  else row.append(made);
  return made;
}
