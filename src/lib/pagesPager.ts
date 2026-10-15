// ONE GESTURE, ONE CARD — the pages view's wheel and keys (2026-10-15).
//
// Mandatory snap alone did not page on a desktop: Chrome resolves a mouse
// wheel tick (or three) by snapping to the NEAREST stop, and a 100px tick on
// an 844px card is nearest to the card it started on, so the page sprang
// back and a visitor had to spin hard to get anywhere. The keys did nothing
// at all, because the focused body's scroller is the viewport, not
// .page-wrap. So while the pages are on screen this takes the vertical wheel
// and the paging keys and moves exactly one card per gesture — the snap
// stays underneath as the resting geometry. Touch never fires `wheel`, so a
// phone keeps the native flick; a horizontal wheel or a trackpad swipe
// sideways is left to the works row.
//
// A gesture is a burst of wheel events with no gap longer than QUIET_MS: a
// trackpad flick and its momentum tail are one card, not ten.

const QUIET_MS = 180;
const LOCK_MS = 650;
const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Where one step lands. `stops` are the scroll offsets that put each card's
 * top under the header, ascending; `end` is the bottom of the page (the
 * footer). Past the last card a step goes to the end; before the first it
 * goes to 0.
 */
export function nextStop(stops: number[], current: number, dir: 1 | -1, end: number): number {
  const slack = 2;
  if (dir > 0) {
    const ahead = stops.find((s) => s > current + slack);
    return ahead ?? Math.max(current, end);
  }
  const behind = [...stops].reverse().find((s) => s < current - slack);
  return behind ?? 0;
}

let live: AbortController | null = null;

/** The element that actually scrolls: .page-wrap on a desktop, the document
 *  on a phone (global.css gives html its overflow back there). */
function scrollerOf(wrap: HTMLElement): HTMLElement {
  return getComputedStyle(wrap).overflowY === "visible"
    ? (document.scrollingElement as HTMLElement)
    : wrap;
}

function step(wrap: HTMLElement, dir: 1 | -1) {
  const scroller = scrollerOf(wrap);
  const pad = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
  const origin = scroller === wrap ? wrap.getBoundingClientRect().top : 0;
  const current = scroller.scrollTop;
  const stops = [...document.querySelectorAll<HTMLElement>("#member-grid > .cgrid__cell:not([hidden])")]
    .map((cell) => Math.round(cell.getBoundingClientRect().top - origin + current - pad))
    .sort((a, b) => a - b);
  const end = scroller.scrollHeight - scroller.clientHeight;
  const top = nextStop(stops, current, dir, end);
  if (top === current) return;
  scroller.scrollTo({ top, behavior: window.matchMedia(REDUCED).matches ? "instant" : "smooth" });
}

/** True when the event's target can still scroll that way on its own — the
 *  words column on a long bio, an open bar menu — so the wheel is theirs. */
function innerCanScroll(target: EventTarget | null, dy: number): boolean {
  let el = target instanceof Element ? target : null;
  while (el && !el.classList.contains("page-wrap") && el !== document.body) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (dy < 0 && el.scrollTop > 0) return true;
    }
    el = el.parentElement;
  }
  return false;
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Turns the paging on (the pages view is on screen) or off. Idempotent. */
export function setPagesPaging(on: boolean): void {
  live?.abort();
  live = null;
  if (!on) return;
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (!wrap) return;
  live = new AbortController();
  const { signal } = live;

  let gestureOpen = false;
  let quiet = 0;
  let lockedUntil = 0;
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return; // pinch / zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // the works row's
      if (document.querySelector(".pswp--open")) return;
      if (innerCanScroll(e.target, e.deltaY)) return;
      e.preventDefault();
      clearTimeout(quiet);
      quiet = window.setTimeout(() => (gestureOpen = false), QUIET_MS);
      if (gestureOpen || performance.now() < lockedUntil || e.deltaY === 0) return;
      gestureOpen = true;
      lockedUntil = performance.now() + LOCK_MS;
      step(wrap, e.deltaY > 0 ? 1 : -1);
    },
    { passive: false, signal },
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (typing(e.target) || document.querySelector(".pswp--open")) return;
      const down = e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey);
      const up = e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      // Space on a focused button or link is that control's.
      if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("a, button, summary")) return;
      e.preventDefault();
      step(wrap, down ? 1 : -1);
    },
    { signal },
  );
  signal.addEventListener("abort", () => clearTimeout(quiet));
}

document.addEventListener("astro:before-swap", () => setPagesPaging(false));
