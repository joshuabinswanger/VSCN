// A PRESS YOU CAN FEEL (2026-10-28, Josh: "make them feel snappy and have a
// visually haptic feedback. can we add vibration or sound when navigating
// the nav section?"). Every header and directory control squashes under the
// finger or the mouse button, quickly, and springs back past its size on the
// release, so a tap reads as a physical press. On a phone that can (Android;
// iOS Safari has no vibration) the press also ticks the motor once, short.
// No sound: it plays in libraries and meetings, and the browser holds it
// back until the first tap anyway.
//
// WAAPI on the `scale` property, not a CSS :active rule: these controls carry
// transitions of their own, which a second transition list would replace,
// and `scale` composes with any transform they already have. Listeners on
// the document, once: the nav and the bar persist across page changes.

const PRESSABLE = [
  ".nav-link",
  ".nav-menu-btn",
  ".nav-portfolios",
  ".lang-toggle",
  ".bar-menu__trigger",
  ".view-toggle__btn",
  ".sort-menu__btn",
  ".tag-filter__option",
].join(", ");

const DOWN_MS = 90;
const UP_MS = 420;
// Down to 0.94, back past 1 and settled: a spring drawn as keyframes.
const SPRING: Keyframe[] = [{ scale: "0.94" }, { scale: "1.035", offset: 0.45 }, { scale: "0.995", offset: 0.75 }, { scale: "1" }];

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarse = window.matchMedia("(pointer: coarse)");
let pressed: HTMLElement | null = null;
let squash: Animation | null = null;

function release() {
  const el = pressed;
  pressed = null;
  if (!el) return;
  squash?.cancel();
  squash = null;
  el.animate(SPRING, { duration: UP_MS, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0 || reduced.matches || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>(PRESSABLE);
    if (!el || el.matches(":disabled")) return;
    release();
    pressed = el;
    squash = el.animate([{ scale: "1" }, { scale: "0.94" }], { duration: DOWN_MS, easing: "ease-out", fill: "forwards" });
  },
  { passive: true },
);
for (const type of ["pointerup", "pointercancel", "dragstart"]) {
  document.addEventListener(type, release, { passive: true });
}

// The tick goes on the click: a touch only grants the page the right to
// vibrate once the finger lifts, so a pointerdown would be refused.
document.addEventListener(
  "click",
  (e) => {
    if (!coarse.matches || !(e.target instanceof Element) || !e.target.closest(PRESSABLE)) return;
    navigator.vibrate?.(8);
  },
  { passive: true },
);
