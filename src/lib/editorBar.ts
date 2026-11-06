// The profile editor's bar (ProfileForm.astro, 2026-10-13): its animated size
// and the Plus button's pull-down menu. Kept out of profileEditorController.ts
// because neither knows anything about profiles — the controller decides WHAT
// the bar holds; this makes the bar follow smoothly and makes the menu behave
// like a menu.

/**
 * THE BAR FOLLOWS ITS CONTENT, SMOOTHLY (Josh: "add smooth animation when its
 * width changes"). CSS cannot transition `width: auto`, and
 * `interpolate-size` is not in every Safari yet, so the bar gets explicit
 * pixel sizes measured from its inner box, and transitions those. The inner
 * box is `width: max-content` capped by the window, so its size never depends
 * on the bar's — no feedback loop, and a ResizeObserver on it sees every
 * change: a tab switch, the card hiding the mode switch, a wrap to two rows,
 * the Save label turning into "Saving…".
 *
 * The first measurement is applied without a transition (the bar must not
 * grow in from nothing on page load); `is-sized` arms the transition after.
 * Returns the teardown.
 */
export function followContentSize(bar: HTMLElement, inner: HTMLElement): () => void {
  let armed = false;
  const apply = () => {
    const r = inner.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    bar.style.width = `${Math.ceil(r.width)}px`;
    bar.style.height = `${Math.ceil(r.height)}px`;
    if (!armed) {
      armed = true;
      // Two frames: the first paints the measured size, the second arms the
      // transition, so the initial size is never animated.
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add("is-sized")));
    }
  };
  const ro = new ResizeObserver(apply);
  ro.observe(inner);
  apply();
  return () => ro.disconnect();
}

/**
 * THE BAR FOLDS AWAY ON A PHONE (2026-10-23, Josh: "they should be able to be
 * hidden on mobile"). The handle above the bar's two rows toggles `is-folded`
 * on the bar; the stylesheet hides the rows only at the phone breakpoint, so
 * a desktop never shows the handle or a folded bar. The bar's measured size
 * (followContentSize) animates the fold for free.
 * OPEN ON ARRIVAL (2026-11-02, Josh: "start open when we reach the site"):
 * the fold lasts the page only. It was remembered on the device until then.
 * A PANEL THAT FOLDS UP AND DOWN (2026-10-29): the handle is the phone
 * panel's top edge, and a drag on it folds the panel the way it went —
 * down folds, up unfolds — with the click that follows the drag swallowed.
 * SAVE FOLDS TOO (2026-11-04, reversing 11-02's "Save stays"): folded, the
 * panel is the handle alone. Off the Works tab the handle is not drawn and
 * Save shows whatever the fold says (profile-editor.css).
 */
export function bindBarFold(handle: HTMLButtonElement, bar: HTMLElement, signal: AbortSignal): void {
  const apply = (folded: boolean) => {
    bar.classList.toggle("is-folded", folded);
    handle.setAttribute("aria-expanded", String(!folded));
    const label = (folded ? handle.dataset.labelShow : handle.dataset.labelHide) ?? "";
    handle.setAttribute("aria-label", label);
    handle.title = label;
  };
  let folded = false;
  try {
    localStorage.removeItem("vscn-ebar-folded"); // the old remembered fold
  } catch {
    /* storage blocked: nothing was kept */
  }
  apply(folded);
  const set = (next: boolean) => {
    folded = next;
    apply(folded);
  };
  let startY: number | null = null;
  let dragged = false;
  handle.addEventListener(
    "pointerdown",
    (e) => {
      startY = e.clientY;
      dragged = false;
      // The release lands on the handle even when the finger has left it.
      handle.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  handle.addEventListener(
    "pointerup",
    (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY;
      startY = null;
      if (Math.abs(dy) < 16) return;
      dragged = true;
      set(dy > 0);
    },
    { signal },
  );
  handle.addEventListener(
    "pointercancel",
    () => {
      startY = null;
    },
    { signal },
  );
  handle.addEventListener(
    "click",
    () => {
      if (dragged) {
        dragged = false;
        return;
      }
      set(!folded);
    },
    { signal },
  );
}

/**
 * THE PHONE BAR'S TWO ROWS (2026-11-02, Josh: "save should stay the size it
 * is collapsed on also at the bottom and centered and all the other three
 * buttons at the top in one row"). On a phone the three switches (Edit |
 * Preview, Profile | Card, EN | DE) share the top row and Save stands alone
 * under them, as wide as it is folded. Edit | Preview lives in Save's row in
 * the markup, beside Save as a desktop wants it, so on a phone it is moved to
 * the head of the switches' row and back when the window grows; the
 * stylesheet puts that row first. Moving the element keeps its listeners.
 */
export function bindPhoneBarRows(bar: HTMLElement, signal: AbortSignal): void {
  const mode = bar.querySelector<HTMLElement>(".ebar__mode");
  const main = bar.querySelector<HTMLElement>(".ebar__row--main");
  const group = bar.querySelector<HTMLElement>(".ebar__group");
  if (!mode || !main || !group) return;
  // --bp-mobile (custom-media.css), spelled out: a script cannot read it.
  const phone = window.matchMedia("(width <= 767px), (pointer: coarse) and (height <= 500px)");
  const place = () => {
    if (phone.matches) {
      if (mode.parentElement !== group) group.prepend(mode);
    } else if (mode.parentElement !== main) {
      main.prepend(mode);
    }
  };
  place();
  phone.addEventListener("change", place, { signal });
}
