// THE PHONE'S CARD FOLLOWS THE VISIBLE HEIGHT (2026-10-15, Josh: "we don't
// consider the collapsing lower bar in chrome on ios").
//
// A phone's card was sized on 100svh — the screen with every toolbar shown —
// because a height that followed the toolbars mid-scroll resized every card
// under the finger and the snap re-aligned with a visible drop. But Chrome on
// iOS (and Safari's compact bar) collapses its bottom toolbar as soon as the
// reader scrolls, and then the svh card stopped well short of the pills: the
// words floated above them with a band of paper between.
//
// So the card height follows the VISUAL viewport again, but never while the
// reader is moving: a new height waits until no finger is down and the page
// has been still for SETTLE_MS, then eases in (the registered --cpage-vh
// transitions, CommunityGrid.astro) while the card on screen is held at its
// snap position frame by frame — every card above it grows too, so without
// the hold the page would slide by the sum of them. The picture keeps its
// svh size; only the room around the words changes.

const SETTLE_MS = 220;
const EASE_MS = 450;
const PHONE = "(max-width: 767px)";

let live: AbortController | null = null;

function editing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

/** The card resting under the header: the one whose top is nearest the
 *  scroller's snap line. */
function restingCell(grid: HTMLElement, pad: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let gap = Infinity;
  grid.querySelectorAll<HTMLElement>(":scope > .cgrid__cell:not([hidden])").forEach((cell) => {
    const d = Math.abs(cell.getBoundingClientRect().top - pad);
    if (d < gap) {
      gap = d;
      best = cell;
    }
  });
  return best;
}

export function setPagesViewport(on: boolean): void {
  live?.abort();
  live = null;
  const grid = document.getElementById("member-grid");
  const vv = window.visualViewport;
  if (grid) {
    grid.style.removeProperty("--cpage-vh");
    delete grid.dataset.vhEase;
  }
  if (!on || !grid || !vv) return;
  live = new AbortController();
  const { signal } = live;
  const phone = window.matchMedia(PHONE);
  const scroller = document.scrollingElement as HTMLElement;

  let last = -1;
  let touching = false;
  let timer = 0;
  let hold = 0;

  const apply = (animate: boolean) => {
    timer = 0;
    if (!phone.matches || touching || vv.scale !== 1 || editing()) return;
    const h = Math.round(vv.height);
    if (h <= 0 || h === last) return;
    last = h;
    const pad = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
    const cell = animate ? restingCell(grid, pad) : null;
    if (animate) grid.dataset.vhEase = "";
    else delete grid.dataset.vhEase;
    grid.style.setProperty("--cpage-vh", `${h}px`);
    if (!cell) return;
    // Hold the resting card still while every card grows or shrinks.
    cancelAnimationFrame(hold);
    const until = performance.now() + EASE_MS + 50;
    const pin = () => {
      const off = cell.getBoundingClientRect().top - pad;
      if (Math.abs(off) >= 1)
        scroller.scrollTo({ top: scroller.scrollTop + off, behavior: "instant" });
      if (performance.now() < until && !touching) hold = requestAnimationFrame(pin);
    };
    hold = requestAnimationFrame(pin);
  };
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => apply(true), SETTLE_MS);
  };

  vv.addEventListener("resize", later, { signal });
  // Still moving: push the pending height back.
  window.addEventListener("scroll", () => timer && later(), { passive: true, signal });
  window.addEventListener(
    "touchstart",
    () => {
      touching = true;
      cancelAnimationFrame(hold);
    },
    { passive: true, signal }
  );
  const lift = () => {
    touching = false;
    later();
  };
  window.addEventListener("touchend", lift, { passive: true, signal });
  window.addEventListener("touchcancel", lift, { passive: true, signal });
  phone.addEventListener(
    "change",
    () => {
      last = -1;
      later();
    },
    { signal }
  );
  signal.addEventListener("abort", () => {
    if (timer) clearTimeout(timer);
    cancelAnimationFrame(hold);
  });
  // The first height lands at once, unanimated: nothing has been seen yet.
  apply(false);
}

document.addEventListener("astro:before-swap", () => setPagesViewport(false));
