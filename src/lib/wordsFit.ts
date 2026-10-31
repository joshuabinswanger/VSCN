// ────────────────────────────────────────────────────────────────────────
// THE WORDS COLUMN FITS ITS LONGEST *LINE* (2026-10-27, Josh: "if there is a
// line break it still only takes the longer line, not the full line length").
//
// The pages view's words column is `width: fit-content`, which is the
// MAX-CONTENT of its text: a name or role that wraps is measured as if it
// were still one line, so the column stays at its cap and PROFILE → stands
// far from the words that actually wrapped. CSS has no way to shrink a box to
// its longest wrapped line, so this measures it: with the column at its
// natural width, the right edge of every line of the name and role, then the
// column's width set to that plus the head's overhang (--ccard-words-fit,
// read by the pages rule in CommunityGrid.astro).
//
// Narrowing to the longest line cannot re-wrap anything: each break was
// forced because the next word did not fit in a WIDER box. The ceil() is for
// sub-pixel text widths.
// ────────────────────────────────────────────────────────────────────────
import { pageLifetime, releaseWith } from "./pageLifecycle.ts";

const DESKTOP = "(767px < width) and ((not (pointer: coarse)) or (500px < height))";
const FIT = "--ccard-words-fit";
const WORDS = '.cgrid[data-pattern="pages"] > .cgrid__cell:not([hidden]) > .ccard > .ccard__words';

/** The furthest right edge of any line of text under `root`. */
function longestLineRight(root: Element): number {
  let right = 0;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) right = Math.max(right, rect.right);
  }
  return right;
}

function fitAll(): void {
  const all = [...document.querySelectorAll<HTMLElement>('.ccard__words')];
  // Natural widths first: every column back to what CSS alone gives it.
  for (const words of all) words.style.removeProperty(FIT);
  if (!window.matchMedia(DESKTOP).matches) return;

  // Read everything, then write everything: one layout, not one per card.
  const widths = new Map<HTMLElement, number>();
  for (const words of document.querySelectorAll<HTMLElement>(WORDS)) {
    const box = words.getBoundingClientRect();
    const head = words.querySelector(".ccard__head");
    if (!box.width || !head) continue;
    const right = longestLineRight(head);
    if (!right) continue;
    const style = getComputedStyle(words);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const overhang = parseFloat(getComputedStyle(head).paddingRight) || 0;
    // PROFILE is right-aligned in the column and must fit in it.
    const profile = words.querySelector<HTMLElement>(".profile-link")?.offsetWidth ?? 0;
    let width = Math.max(right - box.left + overhang + padR, profile + padL + padR);
    // Never wider than the column already was.
    width = Math.min(Math.ceil(width), box.width);
    if (style.boxSizing === "content-box") width -= padL + padR;
    widths.set(words, width);
  }
  for (const [words, width] of widths) words.style.setProperty(FIT, `${width}px`);
}

document.addEventListener("astro:page-load", () => {
  const grid = document.getElementById("member-grid");
  if (!grid) return;
  const life = pageLifetime();

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fitAll();
    });
  };
  releaseWith(life, () => cancelAnimationFrame(frame));

  // A cell coming back from display:none, or the window changing width.
  const observer = new ResizeObserver(schedule);
  for (const cell of grid.querySelectorAll(".cgrid__cell")) observer.observe(cell);
  releaseWith(life, () => observer.disconnect());

  // The directory dealing a new set of cells, or a view switch.
  document.addEventListener("community:layout-changed", schedule, { signal: life });
  window.addEventListener("resize", schedule, { signal: life });
  // The name's font arriving changes every line.
  void document.fonts?.ready.then(() => {
    if (!life.aborted) schedule();
  });
  schedule();
});
