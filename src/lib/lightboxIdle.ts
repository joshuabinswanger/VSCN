/**
 * THE CONTROLS STEP BACK WHEN THE MOUSE RESTS (2026-11-05, Josh: "how would
 * we hide the bar on desktop?" — agreed: on a still mouse, like a video
 * player). A phone already has this: PhotoSwipe's tap toggles
 * `pswp--ui-visible`, which fades every `pswp__hide-on-close` element (the
 * artist line, the pager, the close word, the words' tab). A desktop has no
 * free click for it — clicking the picture zooms, clicking the paper closes —
 * so there the same class is dropped after IDLE_MS without movement, along
 * with the pointer, and the first movement, wheel or key brings both back.
 *
 * Never while the pointer is over a control or the words' tab is open: the
 * reader is using them.
 */
import type PhotoSwipe from "photoswipe";

const IDLE_MS = 2500;
/** What counts as "using the controls" while the pointer rests on it. */
const CONTROLS = ".pswp__top-bar, .pswp__vscn-sheet, .pswp__vscn-credit, .pswp__button";

export function attachIdleHide(pswp: PhotoSwipe): void {
  if (typeof matchMedia !== "function" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const root = pswp.element;
  if (!root) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let over: Element | null = null;
  let closing = false;

  const rest = () => {
    if (closing) return;
    const busy = root.classList.contains("pswp--vscn-sheet-open") || over?.closest(CONTROLS);
    if (busy) return arm();
    root.classList.remove("pswp--ui-visible");
    root.classList.add("pswp--vscn-idle");
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(rest, IDLE_MS);
  };
  const wake = (e?: Event) => {
    if (closing) return;
    if (e && "target" in e && e.target instanceof Element) over = e.target;
    if (root.classList.contains("pswp--vscn-idle")) {
      root.classList.remove("pswp--vscn-idle");
      root.classList.add("pswp--ui-visible");
    }
    arm();
  };

  root.addEventListener("pointermove", wake, { passive: true });
  root.addEventListener("wheel", wake, { passive: true });
  root.addEventListener("keydown", wake);
  pswp.on("change", () => wake());
  // PhotoSwipe drives the class itself through the close animation.
  pswp.on("close", () => {
    closing = true;
    clearTimeout(timer);
    root.classList.remove("pswp--vscn-idle");
  });
  pswp.on("destroy", () => clearTimeout(timer));
  arm();
}
