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
// ON THE PICTURE A PHONE'S SWIPE IS THE CAROUSEL'S (2026-10-16): the frame
// lets the browser pan only sideways (CommunityGrid.astro), so a vertical
// swipe there would do nothing; a vertical one steps one card here instead.
// (2026-10-16, Josh: "sometimes it doesn't react at all"): the first cut asked
// for 40px at 1.5 : 1, which a thumb's arcing flick often missed, and dropped
// any gesture the browser ended with touchcancel. Now any MOSTLY vertical move
// past SWIPE_PX is a step, finished by touchend or touchcancel (last known
// point). Not "did the works row move": under pan-x the row follows even a
// vertical swipe's small sideways drift, so it always moves.
//
// A gesture is a burst of wheel events with no gap longer than QUIET_MS: a
// trackpad flick and its momentum tail are one card, not ten.
//
// A NEW SWIPE INSIDE A TAIL IS A NEW GESTURE (2026-10-16, Josh: "the scroll
// still somehow needs an occasional click to work"): a trackpad's momentum
// tail can run on for a second or more in tiny deltas with no gap, so a
// second swipe made before it died joined the old gesture and did nothing —
// until a click, which stops the fling. Now, once the lock has passed, a
// delta that rises well above the tail's floor after the tail had decayed
// (freshSwipe), or one in the other direction, starts a new gesture.

const QUIET_MS = 180;
const LOCK_MS = 650;
const REDUCED = "(prefers-reduced-motion: reduce)";

/** Inside an open gesture: does this delta start a new swipe? `peak` and
 *  `floor` are the largest delta since the last step and the smallest
 *  after it (absolute). Fresh when the move had decayed to under a third of
 *  its peak and this delta is three times that floor and not a jitter. */
export function freshSwipe(peak: number, floor: number, abs: number): boolean {
  return floor < peak * 0.3 && abs >= Math.max(12, floor * 3);
}
const SWIPE_PX = 24;

/** A finished touch on the picture: the step it asks for, or 0 when it was a
 *  tap or a mostly sideways (carousel) move. */
export function swipeStep(dx: number, dy: number): 1 | -1 | 0 {
  if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) <= Math.abs(dx)) return 0;
  return dy < 0 ? 1 : -1;
}

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
  let peak = 0;
  let floor = 0;
  let dir = 0;
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
      if (e.deltaY === 0) return;
      const abs = Math.abs(e.deltaY);
      const sign = Math.sign(e.deltaY);
      const now = performance.now();
      const fresh =
        gestureOpen && now >= lockedUntil && (sign !== dir || freshSwipe(peak, floor, abs));
      if (gestureOpen && !fresh) {
        if (abs > peak) peak = floor = abs;
        else floor = Math.min(floor, abs);
        return;
      }
      if (now < lockedUntil) return;
      gestureOpen = true;
      lockedUntil = now + LOCK_MS;
      peak = floor = abs;
      dir = sign;
      step(wrap, sign > 0 ? 1 : -1);
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
  let touch: { x: number; y: number; lx: number; ly: number } | null = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touch =
        e.touches.length === 1 && e.target instanceof Element && e.target.closest("#member-grid .ccard__frame")
          ? { x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY }
          : null;
    },
    { passive: true, signal },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!touch || e.touches.length !== 1) return;
      touch.lx = e.touches[0].clientX;
      touch.ly = e.touches[0].clientY;
    },
    { passive: true, signal },
  );
  const finish = (x: number, y: number) => {
    if (!touch) return;
    const { x: x0, y: y0 } = touch;
    touch = null;
    if (document.querySelector(".pswp--open")) return;
    const dir = swipeStep(x - x0, y - y0);
    if (dir) step(wrap, dir);
  };
  document.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      if (t) finish(t.clientX, t.clientY);
    },
    { passive: true, signal },
  );
  document.addEventListener("touchcancel", () => touch && finish(touch.lx, touch.ly), { passive: true, signal });
  signal.addEventListener("abort", () => clearTimeout(quiet));
}

document.addEventListener("astro:before-swap", () => setPagesPaging(false));
