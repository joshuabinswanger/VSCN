// THE MEMBER RAIL — where you are in the pages (2026-10-23, the desktop UX
// review, suggestion 2). The Portfolios view is one member a screen behind a
// wheel pager, dealt in a fresh order each visit, on a page of fixed height:
// the browser's scrollbar said nothing, there was no "3 / 17", and no way to
// a member but one tick at a time. This is a column of ticks at the right
// edge, one per member on screen in the deal's order, the one showing drawn
// long and black. Hover a tick and the member's name stands beside it; press
// it and the page goes there, with the card's entrance started at once
// (pagesPager.jumpTo), so the trip is a cross-fade, not a blank.
//
// Built by the directory controller's reflectSnap() whenever the pages view
// comes on, a frame late: the controller switches the view BEFORE it hides
// the non-matching cells and deals the survivors, so the rail has to read
// the grid after that work, or it would tick members the filter dropped.
// Torn down for every other view and before a swap. The ticks are named
// buttons but not tab stops — a keyboard pages with ↑ ↓ already, and a
// directory of forty would put forty stops before the first card.
//
// A DESKTOP THING: a phone hides it (global.css) — its picture takes the
// whole width, and a 24px rail over the artwork is a worse cue than none.
import { cellTops, jumpTo, nearestStop } from "./pagesPager.ts";

let live: AbortController | null = null;
let rail: HTMLElement | null = null;

const CELLS = '#member-grid > .cgrid__cell[data-slot="image"]:not([hidden])';

export function setPagesRail(on: boolean): void {
  live?.abort();
  live = null;
  rail?.remove();
  rail = null;
  if (!on) return;
  live = new AbortController();
  const { signal } = live;
  requestAnimationFrame(() => {
    if (!signal.aborted) build(signal);
  });
}

function build(signal: AbortSignal): void {
  const grid = document.getElementById("member-grid");
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (!grid || !wrap || grid.hidden) return;
  const cells = Array.from(document.querySelectorAll<HTMLElement>(CELLS));
  // One member is a page, not a journey: nothing to place yourself in.
  if (cells.length < 2) return;

  const nav = document.createElement("nav");
  nav.className = "prail";
  nav.setAttribute("aria-label", grid.dataset.railLabel || "Members");
  nav.style.setProperty("--prail-n", String(cells.length));
  const ticks = cells.map((cell, i) => {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "prail__tick";
    tick.tabIndex = -1;
    const name = cell.dataset.name || "";
    const label = `${i + 1} / ${cells.length}${name ? ` — ${name}` : ""}`;
    tick.setAttribute("aria-label", label);
    tick.title = name;
    const text = document.createElement("span");
    text.className = "prail__name";
    text.setAttribute("aria-hidden", "true");
    text.textContent = name;
    tick.append(text);
    tick.addEventListener("click", () => jumpTo(cell), { signal });
    nav.append(tick);
    return tick;
  });

  // WHICH TICK IS THE PAGE ON: the cell whose snap stop is nearest the
  // scroll offset — the same reading the keys use (pagesPager.ts).
  let current = -1;
  const reflect = () => {
    const { current: at, cells: now, tops } = cellTops(wrap);
    if (!now.length) return;
    const i = cells.indexOf(now[nearestStop(tops, at)]);
    if (i === current) return;
    current = i;
    ticks.forEach((tick, n) => {
      tick.classList.toggle("is-current", n === i);
      if (n === i) tick.setAttribute("aria-current", "true");
      else tick.removeAttribute("aria-current");
    });
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!signal.aborted) reflect();
    });
  };
  // .page-wrap scrolls on a desktop, the document on a phone: both heard.
  wrap.addEventListener("scroll", onScroll, { passive: true, signal });
  window.addEventListener("scroll", onScroll, { passive: true, signal });

  rail = nav;
  document.body.append(nav);
  reflect();
}

document.addEventListener("astro:before-swap", () => setPagesRail(false));
